import type { jobEvidenceViewSchema } from "@reactive-resume/schema/job-evidence";
import type { z } from "zod";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { buildJobPassages } from "@reactive-resume/resume/ats";
import { Button } from "@reactive-resume/ui/components/button";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { LiteralJobEvidence } from "./literal-job-evidence";
import { ReviewLaunch, ReviewNotice, ReviewOperationPanel } from "@/features/resume/editor/proposals/review-operation";
import { useVariantsCopy } from "@/features/resume/variants/copy.generated";
import { TranslationReview } from "@/features/resume/variants/translation-review";
import { client, orpc } from "@/libs/orpc/client";
export function JobEvidencePage({
	resumeId,
	data,
	onChange,
	onRefresh,
}: {
	resumeId: string;
	data: z.infer<typeof jobEvidenceViewSchema>;
	onChange: () => void;
	onRefresh: () => void;
}) {
	const copy = useVariantsCopy();
	const navigate = useNavigate();
	const family = useQuery(orpc.resume.variants.list.queryOptions({ input: { resumeId } }));
	const current = family.data?.find((document) => document.resumeId === resumeId);
	const cv = useQuery(orpc.resume.getById.queryOptions({ input: { id: resumeId } }));
	const [started, setStarted] = useState<string | null>(null);
	const operationId = started ?? ("operationId" in data.semantic ? data.semantic.operationId : null);
	const create = useMutation({
		mutationFn: () => {
			if (!cv.data || !data.job) throw new Error("SOURCE_UNAVAILABLE");
			return client.resume.variants.create({
				sourceResumeId: resumeId,
				expectedUpdatedAt: cv.data.updatedAt.toISOString(),
				variantKind: "job",
				requestKey: crypto.randomUUID(),
				jobId: data.job.jobId,
				jobRevision: data.job.revision,
			});
		},
		onSuccess: (copy) => void navigate({ to: "/dashboard/resumes/$resumeId/job", params: { resumeId: copy.resumeId } }),
	});
	const selection = data.selection;
	return (
		<div className="grid gap-4">
			<h2 className="type-section" dir="auto">
				{copy("jobs.comparison.resultTitle", { jobTitle: data.job?.role ?? "" })}
			</h2>
			{data.literal && <LiteralJobEvidence report={data.literal} resumeId={resumeId} />}
			<SectionCard>
				<h3 className="type-label">{copy("jobs.evidence.principleTitle")}</h3>
				{data.semantic.state === "complete" ? (
					data.semantic.findings.requirements.map((requirement) => (
						<SectionCard key={requirement.id}>
							<p dir="auto">{requirement.explanation}</p>
							<p>
								{requirement.verdict === "supported" ? (
									copy("jobs.evidence.status.found")
								) : requirement.verdict === "partial" ? (
									copy("jobs.evidence.status.partial")
								) : requirement.verdict === "no_evidence" ? (
									copy("jobs.evidence.status.absent")
								) : (
									<Trans>Unclear</Trans>
								)}
							</p>
							<details>
								<summary>
									<Trans>Evidence</Trans>
								</summary>
								{requirement.spanIds.map((id) => (
									<blockquote key={id} dir="auto">
										{data.job?.text}
									</blockquote>
								))}
								{cv.data &&
									buildJobPassages(cv.data.data)
										.filter((passage) => requirement.evidenceIds.includes(passage.id))
										.map((passage) => (
											<div key={passage.id}>
												<blockquote dir="auto">{passage.text}</blockquote>
												<Link to="/builder/$resumeId" params={{ resumeId }} search={{ source: passage.target }}>
													{copy("jobs.evidence.showInCv")}
												</Link>
											</div>
										))}
							</details>
							{["partial", "no_evidence", "unclear"].includes(requirement.verdict) && (
								<Link to="/dashboard/career/information">{copy("jobs.evidence.addFact")}</Link>
							)}
						</SectionCard>
					))
				) : (
					<p>
						<Trans>
							Semantic evidence requires a separately verified review. Literal coverage is available without AI.
						</Trans>
					</p>
				)}
				{cv.data && selection && (
					<ReviewLaunch
						kind="review.job-evidence"
						prepare={() =>
							client.ai.variantReview.prepare({
								kind: "review.job-evidence",
								resumeId,
								expectedUpdatedAt: cv.data.updatedAt.toISOString(),
								jobId: selection.jobId,
								jobRevision: selection.jobRevision,
								expectedSelectionRevision: selection.revision,
							})
						}
						onStarted={setStarted}
					>
						<Trans>Review job evidence</Trans>
					</ReviewLaunch>
				)}
				{operationId && (
					<ReviewOperationPanel operationId={operationId}>
						<TranslationReview operationId={operationId} onSaved={onRefresh} />
					</ReviewOperationPanel>
				)}
			</SectionCard>
			{current?.variantKind === "job" && cv.data && selection && (
				<ReviewLaunch
					kind="review.tailoring"
					prepare={() =>
						client.ai.variantReview.prepare({
							kind: "review.tailoring",
							resumeId,
							expectedUpdatedAt: cv.data.updatedAt.toISOString(),
							jobId: selection.jobId,
							jobRevision: selection.jobRevision,
							expectedSelectionRevision: selection.revision,
						})
					}
					onStarted={setStarted}
				>
					<Trans>Review tailored wording</Trans>
				</ReviewLaunch>
			)}
			{current?.variantKind === "job" && current.operationId && current.operationId !== operationId && (
				<ReviewOperationPanel operationId={current.operationId}>
					<TranslationReview operationId={current.operationId} onSaved={onRefresh} />
				</ReviewOperationPanel>
			)}
			<div className="flex flex-wrap gap-2">
				<Button
					disabled={create.isPending || cv.data?.isLocked || current?.variantKind === "job"}
					onClick={() => create.mutate()}
				>
					{copy("jobs.copy.create")}
				</Button>
				<Button variant="secondary" onClick={onChange}>
					<Trans>Change job ad</Trans>
				</Button>
			</div>
			{create.error && (
				<ReviewNotice retry={() => create.reset()}>
					<Trans>
						Could not create a copy. Check the included copy allowance and current source. Your CV is unchanged.
					</Trans>
				</ReviewNotice>
			)}
			<p>{copy("jobs.copy.toast.originalPreserved")}</p>
		</div>
	);
}
