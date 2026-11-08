import type { PdfAtsReport } from "@reactive-resume/resume/ats-pdf";
import { Trans } from "@lingui/react/macro";

export function AnalysisStatus({ report }: { report: PdfAtsReport }) {
	return (
		<p role="status" className="rounded-md border border-line bg-sunken p-3 text-sm text-ink-2">
			{report.analysis?.status === "failed" ? (
				<Trans>Analysis could not be completed. No overall score is available.</Trans>
			) : (
				<Trans>Analysis is incomplete. No overall score is available.</Trans>
			)}
		</p>
	);
}
