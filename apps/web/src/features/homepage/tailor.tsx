import type { EvidenceStatus, FactId, SampleJobId } from "./example";
import type { ThreadTone } from "./threads";
import type { IconName } from "@reactive-resume/ui/components/icon";
import type { CSSProperties } from "react";
import { Trans } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { cn } from "@reactive-resume/utils/style";
import { CvPaper } from "./cv-paper";
import { landingExample, sampleJobIds } from "./example";
import { exampleLanguageFor } from "./hero";
import { reveal } from "./reveal";
import { SectionIntro } from "./section";
import { Threads } from "./threads";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

const statusStyle = {
	found: { icon: "check-circle", tone: "text-accent-text", badge: "accent", label: "landing.example.found" },
	partial: { icon: "warning-circle", tone: "text-warn-text", badge: "warn", label: "landing.example.partial" },
	missing: { icon: "circle", tone: "text-ink-3", badge: "outline", label: "landing.example.missing" },
} as const satisfies Record<
	EvidenceStatus,
	{ icon: IconName; tone: string; badge: "accent" | "warn" | "outline"; label: string }
>;

/**
 * Pick a sample job and see which requirements the CV supports: found, partial or missing, never a pass score. A
 * thread joins each supported requirement to its CV line and re-anchors when the job changes. Local state only.
 */
export function TailorShowcase() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	const language = exampleLanguageFor(locale);
	const cv = landingExample[language];
	const [jobId, setJobId] = useState<SampleJobId>("accountant");
	const [shown, setShown] = useState<FactId | null>(null);
	const [asked, setAsked] = useState<number | null>(null);
	const stage = useRef<HTMLDivElement>(null);
	const job = cv.jobs[jobId];
	const linked = job.requirements.flatMap((requirement) => (requirement.fact ? [requirement.fact] : []));
	const highlightTones: Partial<Record<FactId, ThreadTone>> = {};
	for (const requirement of job.requirements) {
		if (requirement.fact && requirement.status !== "missing") {
			highlightTones[requirement.fact] = statusStyle[requirement.status].badge;
		}
	}
	const choose = (id: SampleJobId) => {
		document.querySelector(`[data-job-option="${id}"]`)?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
			behavior: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
		});
		setJobId(id);
		setShown(null);
		setAsked(null);
	};
	return (
		<section aria-labelledby="tailor-title" className="bg-bg landing-section">
			<div className="landing-container grid gap-8 lg:gap-10">
				<SectionIntro titleId="tailor-title" title={copy("landing.tailor.title")} body={copy("landing.tailor.body")} />
				<figure aria-label={copy("landing.example.disclosure")}>
					<div
						ref={stage}
						{...reveal(2)}
						className="relative mx-auto grid w-full max-w-xl items-start gap-8 lg:max-w-none lg:grid-cols-2 lg:gap-24"
					>
						<Threads
							container={stage}
							version={`${jobId}-${language}`}
							className="z-10 hidden lg:block"
							threads={job.requirements.flatMap((requirement, index) =>
								requirement.fact
									? [
											{
												from: `requirement-${index}`,
												to: requirement.fact,
												tone: highlightTones[requirement.fact] ?? "accent",
											},
										]
									: [],
							)}
						/>
						<div data-thread-edge className="overflow-hidden rounded-3xl border border-line bg-raised shadow-e2">
							<div className="scroll-strip border-b border-line bg-surface p-3">
								<SegmentedControl
									size="toolbar"
									variant="accent"
									aria-label={copy("landing.example.jobs")}
									value={jobId}
									onValueChange={(value) => choose(value as SampleJobId)}
									className="flex w-full min-w-max"
								>
									{sampleJobIds.map((id) => (
										<SegmentedControlItem key={id} value={id} data-job-option={id} className="shrink-0 basis-auto">
											<span lang={cv.lang}>{cv.jobs[id].title}</span>
										</SegmentedControlItem>
									))}
								</SegmentedControl>
							</div>
							<ul key={jobId} className="divide-y divide-line">
								{job.requirements.map((requirement, index) => {
									const style = statusStyle[requirement.status];
									return (
										<li key={requirement.text} className="flex items-start gap-3 px-5 py-4 sm:px-6">
											<Icon
												name={style.icon}
												size={24}
												className={cn("mt-0.5 shrink-0 landing-rise", style.tone)}
												style={{ "--rise-delay": `${index * 160}ms` } as CSSProperties}
											/>
											{/* Title and note get the full width; the status and its action share the line below. */}
											<div className="grid min-w-0 flex-1 gap-1">
												<div lang={cv.lang} dir={cv.dir} className="grid gap-0.5">
													<p className="type-section text-ink">{requirement.text}</p>
													<p className="type-body text-ink-3">{requirement.note}</p>
												</div>
												<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
													<Badge data-thread-from={`requirement-${index}`} variant={style.badge}>
														{copy(style.label)}
													</Badge>
													{requirement.fact && requirement.status === "found" ? (
														<button
															type="button"
															aria-pressed={shown === requirement.fact}
															onClick={() => setShown(shown === requirement.fact ? null : (requirement.fact ?? null))}
															className={buttonVariants({ variant: "link", size: "link-compact" })}
														>
															<Icon name="eye" size={14} />
															<Trans context="jobs.evidence.showInCv">Show in CV</Trans>
														</button>
													) : (
														<button
															type="button"
															aria-expanded={asked === index}
															onClick={() => setAsked(asked === index ? null : index)}
															className={buttonVariants({ variant: "link", size: "link-compact" })}
														>
															<Icon name={requirement.status === "partial" ? "pencil" : "plus"} size={14} />
															{requirement.status === "partial" ? (
																<Trans context="jobs.evidence.clarify">Clarify</Trans>
															) : (
																<Trans context="jobs.evidence.addFact">Add a fact</Trans>
															)}
														</button>
													)}
												</div>
												{asked === index && <p className="type-body text-ink-2">{copy("landing.example.ownWords")}</p>}
											</div>
										</li>
									);
								})}
							</ul>
						</div>
						<CvPaper
							language={language}
							compact
							threadTarget
							highlight={shown ? [shown] : linked}
							highlightTones={highlightTones}
							className="gap-4 sm:p-6"
						/>
					</div>
				</figure>
			</div>
		</section>
	);
}
