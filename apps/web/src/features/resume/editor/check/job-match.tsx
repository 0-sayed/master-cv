import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { useEditorStore } from "../store";
import { useReadiness } from "./use-readiness";
import { LiteralJobEvidence } from "@/features/career/literal-job-evidence";
/** The persisted exact job is shared with the dashboard; no job keyword can become a CV fact here. */
export function JobMatchTab() {
	const identity = useEditorStore((state) => state.identity);
	const { jobReport, results } = useReadiness();
	return identity ? (
		<div className="grid gap-4">
			{jobReport && (results.job.state === "complete" || results.job.state === "partial") && (
				<LiteralJobEvidence report={jobReport} resumeId={identity.resumeId} />
			)}
			<JobComparisonLink />
		</div>
	) : null;
}

export function JobComparisonLink() {
	const identity = useEditorStore((state) => state.identity);
	return identity ? (
		<Link
			to="/dashboard/resumes/$resumeId/job"
			params={{ resumeId: identity.resumeId }}
			className={buttonVariants({ variant: "secondary", size: "sm" })}
		>
			<Trans>Compare with a job</Trans>
		</Link>
	) : null;
}
