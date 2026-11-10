import type { DesignSource } from "@/features/resume/editor/design/style-groups";
import type { Template } from "@reactive-resume/schema/templates";
import { i18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { produce } from "immer";
import { useEffect, useMemo } from "react";
import { templateSchema } from "@reactive-resume/schema/templates";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SwitchRow } from "@reactive-resume/ui/components/switch";
import { TemplateThumbnail } from "@reactive-resume/ui/components/template-thumbnail";
import { toast } from "@reactive-resume/ui/components/toast";
import { getTemplateImageUrl, templates } from "@/dialogs/resume/template/data";
import { useLetterEditorStore } from "@/features/letters/store";
import { ColorGroup, DesignSourceProvider, PageGroup, TypeGroup } from "@/features/resume/editor/design/style-groups";
import { useEditorStore } from "@/features/resume/editor/store";
import { getOrpcErrorMessage } from "@/libs/error-message";
import { client, orpc } from "@/libs/orpc/client";

const failed = (error: unknown) =>
	toast.add({
		type: "error",
		description: getOrpcErrorMessage(error, { fallback: t`Couldn't change the design. Try again.` }),
	});

const updateDesign = (changes: { designLinked?: boolean; template?: Template }) =>
	useLetterEditorStore.getState().change((letter) =>
		client.coverLetters.update({
			id: letter.id,
			expectedRevision: letter.revision,
			sessionId: useLetterEditorStore.getState().sessionId,
			...changes,
		}),
	);

/** The letter's own type, colors and page, edited like the resume's and saved with what's typed. */
function useLetterDesignSource() {
	const metadata = useLetterEditorStore((state) => state.letter?.style.metadata);
	return useMemo<DesignSource>(
		() => ({
			metadata,
			write: (_key, mutate) => {
				const { letter, edit } = useLetterEditorStore.getState();
				if (!letter || letter.isLocked) return;
				const { typography, design, page } = produce(letter.style.metadata, mutate);
				edit({ metadata: { typography, design, page } });
			},
		}),
		[metadata],
	);
}

/**
 * Design for letters: by default a letter matches its resume's design, changed on the resume. Turned off, the
 * letter keeps a design of its own: its template (hovering one previews it on the page, a click applies it), then
 * its type, color and page.
 */
export function LetterDesignPanel() {
	const letter = useLetterEditorStore((state) => state.letter);
	const setPreview = useEditorStore((state) => state.setPreviewTemplate);
	const designSource = useLetterDesignSource();
	const { data: resumes } = useQuery(orpc.resume.list.queryOptions({ input: {} }));
	// Leaving Design never leaves a preview on the page.
	useEffect(() => () => setPreview(null), [setPreview]);
	if (!letter) return null;

	const resume = resumes?.find((item) => item.id === letter.sourceResumeId);
	const current = letter.style.metadata.template;
	const disabled = letter.isLocked;

	const setLinked = (designLinked: boolean) =>
		void updateDesign({ designLinked })
			.then(() =>
				toast.add({
					description: designLinked
						? t`The letter matches the resume's design again`
						: t`The letter keeps this design as its own`,
				}),
			)
			.catch(failed);

	return (
		<div className="divide-y divide-line">
			<section aria-labelledby="letter-design-match" className="grid gap-3 px-4 py-5">
				<h2 id="letter-design-match" className="text-[15px] font-semibold">
					<Trans>Matching the resume</Trans>
				</h2>
				{letter.sourceResumeId ? (
					<>
						<SwitchRow
							label={t`Match “${resume?.name ?? t`the resume`}”`}
							description={
								letter.designLinked
									? t`Template, type and colors follow the resume, so the pair always matches.`
									: t`The letter keeps a design of its own.`
							}
							checked={letter.designLinked}
							disabled={disabled}
							onCheckedChange={setLinked}
						/>
						{letter.designLinked && (
							<Link
								to="/builder/$resumeId"
								params={{ resumeId: letter.sourceResumeId }}
								search={{ mode: "design" }}
								className={buttonVariants({ variant: "secondary", size: "sm", className: "w-fit" })}
							>
								<Icon name="palette" size={16} />
								<Trans>Change the resume's design</Trans>
							</Link>
						)}
					</>
				) : (
					<p className="text-sm text-ink-2">
						<Trans>Choose a resume in Write to match its design. Until then, the letter has its own.</Trans>
					</p>
				)}
			</section>

			{!letter.designLinked && (
				<section aria-labelledby="letter-design-template" className="grid gap-3 px-4 py-5">
					<h2 id="letter-design-template" className="text-[15px] font-semibold">
						<Trans>Template</Trans>
					</h2>
					<fieldset
						disabled={disabled}
						className="m-0 grid min-w-0 grid-cols-2 gap-3 border-0 p-0"
						onMouseLeave={() => setPreview(null)}
						onBlur={(event) => {
							if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(null);
						}}
					>
						<legend className="sr-only">
							<Trans>Template</Trans>
						</legend>
						{templateSchema.options.map((id) => {
							const selected = id === current;
							return (
								<button
									key={id}
									type="button"
									aria-pressed={selected}
									onMouseEnter={() => setPreview(id === current ? null : id)}
									onFocus={() => setPreview(id === current ? null : id)}
									onClick={() => {
										setPreview(null);
										if (!selected) void updateDesign({ template: id }).catch(failed);
									}}
									className="group/template grid gap-1.5 text-start disabled:cursor-not-allowed disabled:opacity-60"
								>
									<TemplateThumbnail
										src={getTemplateImageUrl(id, i18n.locale)}
										alternateSrc={getTemplateImageUrl(id, i18n.locale.startsWith("ar") ? "en-US" : "ar-SA")}
										selected={selected}
									>
										{selected && (
											<span className="absolute end-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-on-accent">
												<Icon name="check" size={14} />
											</span>
										)}
									</TemplateThumbnail>
									<span className="text-sm leading-4 font-medium">{templates[id].name}</span>
								</button>
							);
						})}
					</fieldset>
				</section>
			)}

			{!letter.designLinked && (
				<DesignSourceProvider value={designSource}>
					<section aria-labelledby="letter-design-type" className="grid gap-3 px-4 py-5">
						<h2 id="letter-design-type" className="text-[15px] font-semibold">
							<Trans>Type</Trans>
						</h2>
						<TypeGroup />
					</section>
					<section aria-labelledby="letter-design-color" className="grid gap-3 px-4 py-5">
						<h2 id="letter-design-color" className="text-[15px] font-semibold">
							<Trans>Color</Trans>
						</h2>
						<ColorGroup />
					</section>
					<section aria-labelledby="letter-design-page" className="grid gap-3 px-4 py-5">
						<h2 id="letter-design-page" className="text-[15px] font-semibold">
							<Trans>Page</Trans>
						</h2>
						<PageGroup />
					</section>
				</DesignSourceProvider>
			)}
		</div>
	);
}
