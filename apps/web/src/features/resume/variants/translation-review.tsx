import type { Proposal, ProposalState } from "@reactive-resume/resume/proposals";
import type { VariantDecisionInput } from "@reactive-resume/schema/resume/variants";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { escapeHtml } from "@reactive-resume/utils/string";
import { ChangeSet } from "../editor/proposals/proposal-list";
import { submitVariantDecision } from "../editor/proposals/review-client";
import { ReviewNotice } from "../editor/proposals/review-operation";
import { Clarification } from "./clarification";
import { useVariantsCopy } from "./copy.generated";
import { TermDialog } from "./term-dialog";
import { QuerySkeleton } from "@/components/query-skeleton";
import { orpc } from "@/libs/orpc/client";

/** Decisions are server acknowledged; generated translation segments never autosave the CV. */
export function TranslationReview({ operationId, onSaved }: { operationId: string; onSaved?: () => void }) {
	const copy = useVariantsCopy();
	const { t } = useLingui();
	const cache = useQueryClient();
	const review = useQuery(orpc.ai.variantReview.get.queryOptions({ input: { operationId } }));
	const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
	const [termId, setTermId] = useState<string | null>(null);
	const pendingRequest = useRef<{ fingerprint: string; input: VariantDecisionInput } | null>(null);
	const decision = useMutation({
		mutationFn: (
			input: Pick<VariantDecisionInput, "subjectIds" | "decision"> &
				Partial<Pick<VariantDecisionInput, "editedText" | "undoDecisionId">>,
		) => {
			if (!review.data) throw new Error("REVIEW_UNAVAILABLE");
			const fingerprint = JSON.stringify({
				operationId,
				expectedUpdatedAt: review.data.updatedAt,
				expectedDecisionId: review.data.latestDecisionId,
				...input,
			});
			if (pendingRequest.current?.fingerprint !== fingerprint)
				pendingRequest.current = {
					fingerprint,
					input: {
						operationId,
						requestKey: crypto.randomUUID(),
						expectedUpdatedAt: review.data.updatedAt,
						expectedDecisionId: review.data.latestDecisionId,
						...input,
					},
				};
			return submitVariantDecision(review.data.result.sourceRevision.id, pendingRequest.current.input);
		},
		onSuccess: async () => {
			pendingRequest.current = null;
			setEditing(null);
			setTermId(null);
			await Promise.all([
				review.refetch(),
				cache.invalidateQueries({ queryKey: orpc.resume.key() }),
				cache.invalidateQueries({ queryKey: orpc.career.jobTargets.key() }),
			]);
			onSaved?.();
		},
	});
	if (review.error)
		return (
			<ReviewNotice retry={() => void review.refetch()}>
				<Trans>Could not load this review.</Trans>
			</ReviewNotice>
		);
	if (!review.data) return <QuerySkeleton shape="rows" />;
	const { result, statuses, terms, segments, stale } = review.data;
	const pendingTerms = terms.terms.filter((term) => term.status !== "confirmed").length;
	const selectedTerm = terms.terms.find((term) => term.id === termId);
	const items =
		result.kind === "review.translation"
			? result.output.segments.map((segment) => ({
					id: segment.sourceId,
					before: review.data?.sourceSegments.find((source) => source.id === segment.sourceId)?.text ?? "",
					after: segments[segment.sourceId]?.text ?? segment.text,
				}))
			: result.kind === "review.summary"
				? [{ id: "summary", before: review.data.beforeSummary, after: result.output.summary.text }]
				: result.kind === "review.tailoring"
					? [
							...result.output.patches.map((patch) => ({ id: patch.id, before: patch.before, after: patch.after })),
							...(result.output.order.length
								? [
										{
											id: "order",
											before: "",
											after: result.output.order
												.map((order) => `${order.sectionId}: ${order.itemIds.join(", ")}`)
												.join("\n"),
										},
									]
								: []),
						]
					: [
							{
								id: "report",
								before: "",
								after: result.output.requirements
									.map((item) => {
										const requirement =
											review.data?.sourceSegments
												.filter((span) => item.spanIds.includes(span.id))
												.map((span) => span.text)
												.join("\n") ?? "";
										const verdict =
											item.verdict === "supported"
												? copy("jobs.evidence.status.found")
												: item.verdict === "partial"
													? copy("jobs.evidence.status.partial")
													: item.verdict === "no_evidence"
														? copy("jobs.evidence.status.absent")
														: t`Unclear`;
										return [requirement, verdict, item.explanation].filter(Boolean).join("\n");
									})
									.join("\n\n"),
							},
						];
	const proposals: Proposal[] =
		result.kind === "review.summary"
			? items.map((item) => ({
					...item,
					target: { sectionId: "summary", field: "content" },
					location: "Summary",
					after: `<p>${escapeHtml(item.after)}</p>`,
					why: "",
					status: statuses[item.id] ?? "pending",
					source: "improve" as const,
				}))
			: result.kind === "review.tailoring"
				? result.output.patches.map((patch) => ({
						id: patch.id,
						target: {
							sectionId: patch.target.sectionId,
							field: patch.target.field,
							...(patch.target.itemId ? { itemId: patch.target.itemId } : {}),
							...(patch.target.roleId ? { roleId: patch.target.roleId } : {}),
						},
						location: patch.target.sectionId,
						before: `<p>${escapeHtml(patch.before)}</p>`,
						after: `<p>${escapeHtml(patch.after)}</p>`,
						why: patch.why,
						status: statuses[patch.id] ?? "pending",
						source: "improve" as const,
					}))
				: [];
	return (
		<div className="grid gap-4" aria-label={copy("language.translation.review")}>
			{stale && (
				<ReviewNotice retry={() => void review.refetch()}>
					<Trans>The source or this copy changed. Keep your work and request a new review.</Trans>
				</ReviewNotice>
			)}
			{result.kind === "review.job-evidence" &&
				result.output.requirements.some((item) => item.verdict === "partial") && (
					<ReviewNotice title={copy("jobs.evidence.status.partial")} retry={() => void review.refetch()}>
						<Trans>
							Only part of the job requirement is supported by this CV. Add confirmed information or request a new
							review.
						</Trans>
					</ReviewNotice>
				)}
			{decision.error && (
				<ReviewNotice retry={() => void review.refetch()}>
					<Trans>The decision was not saved. Reload the review before trying again.</Trans>
				</ReviewNotice>
			)}
			{result.kind === "review.translation" && (
				<>
					<h2 className="type-section">{copy("language.translation.approvalTitle")}</h2>
					<p>{copy("language.terms.confirmationCount", { count: pendingTerms })}</p>
					<p>{copy("language.terms.officialNamesHint")}</p>
					{terms.terms.map((term) => (
						<SectionCard key={term.id}>
							<p dir="auto">{term.source}</p>
							<p dir="auto">{term.value}</p>
							<p>
								{term.status === "confirmed" ? <Trans>Confirmed</Trans> : copy("language.translation.status.pending")}
							</p>
							<Button variant="secondary" disabled={stale || decision.isPending} onClick={() => setTermId(term.id)}>
								{copy("language.term.confirm")}
							</Button>
						</SectionCard>
					))}
				</>
			)}
			{proposals.length > 0 && (
				<ChangeSet
					proposals={proposals}
					states={proposals.map((proposal) => (stale ? "stale" : proposal.status)) as ProposalState[]}
					locked={decision.isPending || stale}
					onAccept={(selected) => decision.mutate({ subjectIds: selected.map((item) => item.id), decision: "accept" })}
					onReject={(selected) => decision.mutate({ subjectIds: selected.map((item) => item.id), decision: "reject" })}
					onEdit={(proposal) =>
						setEditing({ id: proposal.id, text: items.find((item) => item.id === proposal.id)?.after ?? "" })
					}
					onSuggestAgain={() => void review.refetch()}
				/>
			)}
			{items
				.filter((item) => !proposals.some((proposal) => proposal.id === item.id) || editing?.id === item.id)
				.map((item) => (
					<SectionCard key={item.id} aria-label={item.id}>
						{item.before && (
							<blockquote dir="auto" className="type-body break-words whitespace-pre-wrap">
								{item.before}
							</blockquote>
						)}
						<p dir="auto" className="type-body break-words whitespace-pre-wrap">
							{item.after}
						</p>
						<p role="status">
							{statuses[item.id] === "accepted" ? (
								<Trans>Accepted</Trans>
							) : statuses[item.id] === "rejected" ? (
								<Trans>Rejected</Trans>
							) : (
								<Trans>Pending</Trans>
							)}
						</p>
						{editing?.id === item.id ? (
							<>
								<Textarea
									aria-label="Edited text"
									dir="auto"
									maxLength={4000}
									value={editing.text}
									onChange={(event) => setEditing({ ...editing, text: event.target.value })}
								/>
								<div className="flex flex-wrap gap-2">
									<Button
										disabled={decision.isPending || !editing.text.trim() || stale}
										onClick={() =>
											decision.mutate({ subjectIds: [item.id], decision: "accept_edited", editedText: editing.text })
										}
									>
										<Trans>Save wording</Trans>
									</Button>
									<Button variant="secondary" disabled={decision.isPending} onClick={() => setEditing(null)}>
										<Trans>Cancel</Trans>
									</Button>
								</div>
							</>
						) : statuses[item.id] === "pending" ? (
							<div className="flex flex-wrap gap-2">
								<Button
									disabled={stale || decision.isPending}
									onClick={() => decision.mutate({ subjectIds: [item.id], decision: "accept" })}
								>
									<Trans>Accept</Trans>
								</Button>
								{item.id !== "report" && item.id !== "order" && (
									<Button
										variant="secondary"
										disabled={stale || decision.isPending}
										onClick={() => setEditing({ id: item.id, text: item.after })}
									>
										<Trans>Edit</Trans>
									</Button>
								)}
								<Button
									variant="secondary"
									disabled={decision.isPending}
									onClick={() => decision.mutate({ subjectIds: [item.id], decision: "reject" })}
								>
									<Trans>Reject</Trans>
								</Button>
							</div>
						) : null}
					</SectionCard>
				))}
			{result.kind === "review.translation" && statuses.translation === "pending" && (
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={
							stale ||
							decision.isPending ||
							pendingTerms > 0 ||
							Object.values(segments).some((segment) => segment.status !== "accepted")
						}
						onClick={() => decision.mutate({ subjectIds: ["translation"], decision: "accept" })}
					>
						<Trans>Approve language copy</Trans>
					</Button>
					<Button
						variant="secondary"
						disabled={decision.isPending}
						onClick={() => decision.mutate({ subjectIds: ["translation"], decision: "reject" })}
					>
						{copy("language.translation.backWithoutApproval")}
					</Button>
				</div>
			)}
			{review.data.undoable.map((undo) => (
				<Button
					key={undo.decisionId}
					variant="secondary"
					disabled={decision.isPending}
					onClick={() =>
						decision.mutate({ subjectIds: undo.subjectIds, decision: "undo", undoDecisionId: undo.decisionId })
					}
				>
					<Trans>Undo</Trans>
				</Button>
			))}
			{
				<Clarification
					operationId={operationId}
					source={result.sourceRevision}
					questions={
						result.kind === "review.summary"
							? result.output.questions
							: result.kind === "review.job-evidence"
								? result.output.requirements
										.filter((requirement) => requirement.verdict !== "supported")
										.slice(0, 20)
										.map((requirement) => ({
											id: `clarify:${requirement.id}`,
											context:
												review.data?.sourceSegments
													.filter((span) => requirement.spanIds.includes(span.id))
													.map((span) => span.text)
													.join("\n") ?? "",
											prompt: t`What experience, study or project can you confirm for this requirement?`,
										}))
								: []
					}
					resolved={[...review.data.answeredQuestionIds, ...review.data.dismissedQuestionIds]}
					stale={stale}
					onSaved={() => void review.refetch()}
				/>
			}
			{selectedTerm && (
				<TermDialog
					term={selectedTerm}
					pending={decision.isPending}
					error={Boolean(decision.error)}
					onCancel={() => setTermId(null)}
					onConfirm={(text) =>
						decision.mutate({ subjectIds: [selectedTerm.id], decision: "accept_edited", editedText: text })
					}
				/>
			)}
		</div>
	);
}
