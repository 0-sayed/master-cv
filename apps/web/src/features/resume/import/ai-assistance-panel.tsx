import type { ReviewState } from "./review-draft";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { masterSectionSchema } from "@reactive-resume/schema/career-master";
import { formatResumeDates, type ResumeDates } from "@reactive-resume/schema/resume/dates";
import { Button } from "@reactive-resume/ui/components/button";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { ReviewLaunch, ReviewNotice, ReviewOperationPanel } from "../editor/proposals/review-operation";
import { getEntries, resolveSection, describeEntry } from "../editor/write/model";
import { applyImportReviewCandidate, importDraftGeneration } from "./ai-assistance";
import { fieldLabel } from "./field-label";
import { QuerySkeleton } from "@/components/query-skeleton";
import { client, orpc } from "@/libs/orpc/client";
import { getSectionTitle } from "@/libs/resume/section";

export function ImportAssistance({
	state,
	flowId,
	pages,
	partial,
	onChange,
}: {
	state: ReviewState;
	flowId: string;
	pages: { page: number; text: string }[];
	partial: boolean;
	onChange: (state: ReviewState) => void;
}) {
	const currentState = useRef(state);
	useEffect(() => {
		currentState.current = state;
	}, [state]);
	const [section, setSection] = useState<"experience" | "education" | "skills" | "languages" | "certifications">(
		"experience",
	);
	const [selection, setSelection] = useState("");
	const pending = useRef<ReviewState["aiReview"]>(undefined);
	const sourceText = pages.map((page) => page.text).join("\n\n");
	const id = useId();
	return (
		<details className="grid min-w-0 gap-3 rounded-lg border border-line p-3">
			<summary className="cursor-pointer type-body">
				<Trans>Get help with uncertain text</Trans>
			</summary>
			<div className="grid gap-3 pt-3">
				<p className="type-body">
					<Trans>
						Select text from the native extraction below. Only that selection is reviewed; the original file stays on
						this device. Contact details are removed. Review every proposed field yourself.
					</Trans>
				</p>
				<label htmlFor={`${id}-section`}>
					<Trans>Section to review</Trans>
				</label>
				<NativeSelect
					id={`${id}-section`}
					value={section}
					onChange={(event) => setSection(masterSectionSchema.parse(event.target.value))}
				>
					{masterSectionSchema.options.map((section) => (
						<option key={section} value={section}>
							{getSectionTitle(section)}
						</option>
					))}
				</NativeSelect>
				<label htmlFor={`${id}-text`}>
					<Trans>Native extracted text — select the uncertain passage</Trans>
				</label>
				<Textarea
					id={`${id}-text`}
					dir="auto"
					value={sourceText}
					readOnly
					onSelect={(event) => {
						const field = event.currentTarget;
						setSelection(field.value.slice(field.selectionStart, field.selectionEnd));
					}}
				/>
				{!sourceText.trim() && (
					<ReviewNotice>
						<Trans>No native text is available. Enter the information manually.</Trans>
					</ReviewNotice>
				)}
				{selection && (
					<blockquote dir="auto" className="type-body wrap-anywhere">
						{selection}
					</blockquote>
				)}
				<ReviewLaunch
					key={JSON.stringify([flowId, section, selection])}
					kind="review.extraction"
					disabled={!selection.trim() || !sourceText.includes(selection)}
					prepare={async () => {
						const draftGeneration = importDraftGeneration(state.data);
						const staged = await client.ai.review.importSource({
							flowId,
							section,
							text: selection,
							partial,
							contactValues: [
								state.data.basics.name,
								state.data.basics.email,
								state.data.basics.phone,
								state.data.basics.location,
								state.data.basics.website.url,
							],
						});
						pending.current = {
							version: 1,
							source: staged.source,
							operationId: "pending",
							result: null,
							draftGeneration,
							appliedCandidateIds: [],
						};
						return { sources: [staged.source], parameters: { sourceId: staged.source.id } };
					}}
					onStarted={(operationId) => {
						if (pending.current) onChange({ ...currentState.current, aiReview: { ...pending.current, operationId } });
					}}
				>
					<Trans>Review selected text</Trans>
				</ReviewLaunch>
				{state.aiReview && (
					<ReviewOperationPanel operationId={state.aiReview.operationId}>
						<ExtractionCandidates state={state} onChange={onChange} />
					</ReviewOperationPanel>
				)}
			</div>
		</details>
	);
}
function ExtractionCandidates({ state, onChange }: { state: ReviewState; onChange: (state: ReviewState) => void }) {
	const review = state.aiReview;
	const query = useQuery(orpc.ai.review.get.queryOptions({ input: { operationId: review?.operationId ?? "" } }));
	const [targets, setTargets] = useState<Record<string, string>>({});
	const [error, setError] = useState(false);
	const id = useId();
	useEffect(() => {
		if (review && query.data?.result.kind === "extraction" && !review.result)
			onChange({ ...state, aiReview: { ...review, result: query.data.result } });
	}, [query.data, review, state, onChange]);
	if (!review) return null;
	if (query.error)
		return (
			<ReviewNotice
				retry={() => {
					void query.refetch();
				}}
			>
				<Trans>Could not reload this review. Your draft is kept.</Trans>
			</ReviewNotice>
		);
	if (!query.data) return <QuerySkeleton shape="rows" label={<Trans>Loading review…</Trans>} />;
	const result = query.data.result;
	if (result.kind !== "extraction") return null;
	const stale =
		review.draftGeneration !== importDraftGeneration(state.data) ||
		review.source.id !== result.sourceRevision.id ||
		review.source.revision !== result.sourceRevision.revision;
	return (
		<div className="grid gap-3">
			{(stale || error) && (
				<ReviewNotice>
					<Trans>This draft or source changed. Keep your manual corrections and request a new review.</Trans>
				</ReviewNotice>
			)}
			{result.candidates.length === 0 && (
				<p role="status">
					<Trans>No fields were extracted from this selection. Continue manually.</Trans>
				</p>
			)}
			{result.candidates.map((candidate) => {
				const section = resolveSection(state.data, candidate.section);
				const entries = section ? getEntries(state.data, section) : [];
				const applied = review.appliedCandidateIds.includes(candidate.id);
				return (
					<div key={candidate.id} className="grid gap-2 rounded-lg border border-line p-3">
						<p className="type-body">
							{getSectionTitle(candidate.section)} · {fieldLabel(candidate.field)}
						</p>
						<p dir="auto" className="wrap-anywhere">
							{candidate.value === null ? (
								<Trans>Unknown — enter this yourself</Trans>
							) : typeof candidate.value === "string" ? (
								candidate.value
							) : (
								formatResumeDates(candidate.value as ResumeDates, {
									locale: state.data.metadata.page.locale,
									format: "iso",
								})
							)}
						</p>
						{candidate.rawDateText && <p dir="auto">{candidate.rawDateText}</p>}
						<details>
							<summary>
								<Trans>Evidence</Trans>
							</summary>
							{result.evidence
								.filter((entry) => candidate.evidenceIds.includes(entry.id))
								.map((entry) => (
									<blockquote key={entry.id} dir="auto" className="wrap-anywhere">
										{entry.quote}
									</blockquote>
								))}
						</details>
						<label htmlFor={`${id}-${candidate.id}`}>
							<Trans>Apply to entry</Trans>
						</label>
						<NativeSelect
							id={`${id}-${candidate.id}`}
							value={targets[candidate.id] ?? ""}
							onChange={(event) => setTargets((current) => ({ ...current, [candidate.id]: event.target.value }))}
						>
							<option value="">
								<Trans>Choose an entry</Trans>
							</option>
							{entries.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{describeEntry(candidate.section, entry).title}
								</option>
							))}
							<option value="new">
								<Trans>New entry</Trans>
							</option>
						</NativeSelect>
						<Button
							variant="secondary"
							disabled={stale || applied || candidate.value === null || !targets[candidate.id] || !review.result}
							onClick={() => {
								try {
									const target = targets[candidate.id];
									if (!target) return;
									onChange(applyImportReviewCandidate(state, candidate.id, target));
									setError(false);
								} catch {
									setError(true);
								}
							}}
						>
							{applied ? <Trans>Added to local draft — review before confirming</Trans> : <Trans>Use in draft</Trans>}
						</Button>
					</div>
				);
			})}
			{result.questions.map((question) => (
				<p key={question.id} dir="auto">
					{question.prompt}
				</p>
			))}
		</div>
	);
}
