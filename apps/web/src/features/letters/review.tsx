import type { CoverLetter } from "@reactive-resume/schema/cover-letter/data";
import { Trans } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { z } from "zod";
import { coverLetterOutputSchema } from "@reactive-resume/schema/cover-letter/review";
import { Button } from "@reactive-resume/ui/components/button";
import { Label } from "@reactive-resume/ui/components/label";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { SectionCard, SectionCardTitle } from "@reactive-resume/ui/components/section-card";
import { stripHtml } from "@reactive-resume/utils/string";
import { useLetterEditorStore } from "./store";
import { QuerySkeleton } from "@/components/query-skeleton";
import { ReviewLaunch, ReviewNotice, ReviewOperationPanel } from "@/features/resume/editor/proposals/review-operation";
import { client } from "@/libs/orpc/client";

const resultSchema = z.object({
	output: coverLetterOutputSchema,
	evidence: z.array(z.object({ id: z.string(), text: z.string() })),
});

export function LetterReview({
	letterId,
	operationId,
	expectedRevision,
}: {
	letterId: string;
	operationId: string;
	expectedRevision: number;
}) {
	const letter = useLetterEditorStore((state) => state.letter);
	const review = useQuery({
		queryKey: ["letter-review", letterId, operationId],
		queryFn: () => client.coverLetters.getReview({ letterId, operationId }),
	});
	const result = useQuery({
		queryKey: ["letter-result", letterId, operationId],
		queryFn: async () => resultSchema.parse(await client.ai.operations.result({ id: operationId })),
	});
	const keys = useRef<Partial<Record<"accept" | "reject", string>>>({});
	const decision = useMutation({
		mutationFn: (choice: "accept" | "reject") => {
			const requestKey = (keys.current[choice] ??= crypto.randomUUID());
			return useLetterEditorStore.getState().change(async (current) => {
				if (current.id !== letterId || current.revision !== expectedRevision) throw new ORPCError("CONFLICT");
				return (
					await client.coverLetters.decideReview({
						letterId,
						operationId,
						expectedRevision,
						decision: choice,
						requestKey,
					})
				).letter;
			});
		},
		onSuccess: () => {
			void review.refetch();
		},
	});
	if (review.error || result.error)
		return (
			<ReviewNotice
				retry={() => {
					void review.refetch();
					void result.refetch();
				}}
			>
				<Trans>Could not reload this review. Your draft is kept.</Trans>
			</ReviewNotice>
		);
	if (!review.data || !result.data) return <QuerySkeleton shape="rows" label={<Trans>Loading review…</Trans>} />;
	if (review.data.decision)
		return (
			<p role="status">
				{review.data.decision === "accept" ? (
					<Trans>Proposal saved as a letter version.</Trans>
				) : (
					<Trans>Proposal rejected. Your letter is unchanged.</Trans>
				)}
			</p>
		);
	return (
		<div className="grid gap-4">
			<SectionCard>
				<SectionCardTitle>
					<Trans>Your current letter</Trans>
				</SectionCardTitle>
				<p dir="auto" className="whitespace-pre-wrap">
					{stripHtml(letter?.content)}
				</p>
			</SectionCard>
			<SectionCard>
				<SectionCardTitle>
					<Trans>Proposed letter</Trans>
				</SectionCardTitle>
				{result.data.output.paragraphs.map((paragraph, index) => (
					<p key={index} dir="auto" className="whitespace-pre-wrap">
						{paragraph.text}
					</p>
				))}
				{result.data.output.notes.map((note) => (
					<p key={note} dir="auto">
						{note}
					</p>
				))}
			</SectionCard>
			<SectionCard>
				<SectionCardTitle>
					<Trans>Confirmed CV evidence</Trans>
				</SectionCardTitle>
				<ul>
					{result.data.evidence.map((fact) => (
						<li key={fact.id} dir="auto">
							{fact.text}
						</li>
					))}
				</ul>
			</SectionCard>
			{decision.error && (
				<ReviewNotice>
					<Trans>
						Could not save this decision. Your manual text is kept. Retry, or request a new review if the source
						changed.
					</Trans>
				</ReviewNotice>
			)}
			<div className="flex flex-wrap justify-end gap-2">
				<Button variant="secondary" disabled={decision.isPending} onClick={() => decision.mutate("reject")}>
					<Trans>Reject proposal</Trans>
				</Button>
				<Button disabled={decision.isPending || letter?.id !== letterId} onClick={() => decision.mutate("accept")}>
					<Trans>Accept proposal</Trans>
				</Button>
			</div>
		</div>
	);
}

export function LetterReviewComposer({ letter, disabled }: { letter: CoverLetter; disabled: boolean }) {
	const navigate = useNavigate();
	const lengthId = useId();
	const languageCopy = useMutation({
		mutationFn: async () => {
			if (!(await useLetterEditorStore.getState().flush())) throw new Error("SAVE_REQUIRED");
			return client.coverLetters.create({
				name: `${letter.name} · ${letter.style.metadata.page.locale === "ar-SA" ? "English" : "العربية"}`,
				documentLocale: letter.style.metadata.page.locale === "ar-SA" ? "en-US" : "ar-SA",
				...(letter.sourceResumeId ? { resumeId: letter.sourceResumeId } : {}),
			});
		},
		onSuccess: (created) => {
			void navigate({ to: "/builder/letter/$coverLetterId", params: { coverLetterId: created.id } });
		},
	});
	const [length, setLength] = useState<"short" | "normal">("normal");
	const [started, setStarted] = useState<{ operationId: string; expectedRevision: number } | null>(null);
	const preparedRevision = useRef(letter.revision);
	const latest = useQuery({
		queryKey: ["latest-letter-review", letter.id],
		queryFn: () => client.coverLetters.latestReview({ letterId: letter.id }),
	});
	const currentReview = started ?? latest.data;
	const locale = letter.style.metadata.page.locale;
	return (
		<div data-slot="letter-review-composer" className="grid gap-3">
			<Button variant="secondary" disabled={disabled || languageCopy.isPending} onClick={() => languageCopy.mutate()}>
				{locale === "ar-SA" ? (
					<Trans>Create a separate English letter</Trans>
				) : (
					<Trans>Create a separate Arabic letter</Trans>
				)}
			</Button>
			{languageCopy.error && (
				<ReviewNotice retry={() => languageCopy.mutate()}>
					<Trans>Could not create the separate letter. Your current letter is kept.</Trans>
				</ReviewNotice>
			)}
			<Label htmlFor={lengthId}>
				<Trans>Proposal length</Trans>
			</Label>
			<NativeSelect
				id={lengthId}
				value={length}
				disabled={disabled}
				onChange={(event) => {
					const value = event.target.value;
					if (value === "short" || value === "normal") setLength(value);
				}}
			>
				<option value="normal">
					<Trans>Normal</Trans>
				</option>
				<option value="short">
					<Trans>Short</Trans>
				</option>
			</NativeSelect>
			<ReviewLaunch
				kind="review.cover-letter"
				disabled={disabled || !letter.sourceResumeId || (locale !== "ar-SA" && locale !== "en-US")}
				prepare={async () => {
					const store = useLetterEditorStore.getState();
					if (!(await store.flush())) throw new Error("SAVE_REQUIRED");
					const current = useLetterEditorStore.getState().letter;
					if (!current?.sourceResumeId || current.id !== letter.id) throw new Error("LETTER_EVIDENCE_REQUIRED");
					const documentLocale = current.style.metadata.page.locale;
					if (documentLocale !== "ar-SA" && documentLocale !== "en-US") throw new Error("LETTER_LANGUAGE_REQUIRED");
					const [cv, evidence] = await Promise.all([
						client.resume.getById({ id: current.sourceResumeId }),
						client.career.jobTargets.evidence({ resumeId: current.sourceResumeId }),
					]);
					if (!evidence.selection) throw new Error("LETTER_EVIDENCE_REQUIRED");
					preparedRevision.current = current.revision;
					return client.coverLetters.prepareReview({
						letterId: current.id,
						expectedLetterRevision: current.revision,
						resumeId: current.sourceResumeId,
						expectedUpdatedAt: new Date(cv.updatedAt).toISOString(),
						jobId: evidence.selection.jobId,
						jobRevision: evidence.selection.jobRevision,
						expectedSelectionRevision: evidence.selection.revision,
						documentLocale,
						length,
					});
				}}
				onStarted={(operationId) => setStarted({ operationId, expectedRevision: preparedRevision.current })}
			>
				<Trans>Review a job-specific letter</Trans>
			</ReviewLaunch>
			<p className="type-body text-ink-2">
				<Trans>
					Select a saved job in the linked CV first. Only confirmed CV facts support the proposal. Your manual text
					stays until you accept.
				</Trans>
			</p>
			{latest.error && (
				<ReviewNotice retry={() => void latest.refetch()}>
					<Trans>Could not reload this review. Your draft is kept.</Trans>
				</ReviewNotice>
			)}
			{currentReview && (
				<ReviewOperationPanel operationId={currentReview.operationId}>
					<LetterReview
						key={currentReview.operationId}
						letterId={letter.id}
						operationId={currentReview.operationId}
						expectedRevision={currentReview.expectedRevision}
					/>
				</ReviewOperationPanel>
			)}
		</div>
	);
}
