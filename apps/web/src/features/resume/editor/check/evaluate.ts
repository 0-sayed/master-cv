import { emptyReadiness, pdfReadiness, lintResumeForAts, type ReadinessResults } from "@reactive-resume/resume/ats";
import { getPdfArtifact, hashPdfInput, type PdfSnapshot } from "../../export/pdf-artifact";
import { hasResumePreviewContent } from "../../preview/resume-thumbnail.shared";
import { blobToPdfFile, runAtsCheck } from "@/features/ats-checker/run-ats-check";
/** Each dimension can finish even when another dimension fails. Raw text never leaves this call. */
export async function evaluateReadiness(snapshot: PdfSnapshot, signal: AbortSignal, artifactFactory = getPdfArtifact) {
	const source = { ...snapshot.identity, contentHash: await hashPdfInput(snapshot.data) };
	signal.throwIfAborted();
	const writingReport = lintResumeForAts(snapshot.data);
	const results: ReadinessResults = {
		pdf: emptyReadiness("pdf"),
		job: emptyReadiness("job"),
		writing: {
			dimension: "writing",
			state: "complete",
			source,
			checkedAt: new Date().toISOString(),
			checker: "structured-rules:1",
			extractor: "none",
			options: {},
			coverage: [],
			issues: writingReport.findings.map((finding) => ({
				id: finding.key,
				rule: finding.code,
				ruleVersion: "1",
				severity: finding.severity === "info" ? "tip" : "warning",
				reason: finding.code,
				evidence: {},
				target: { field: finding.pointer },
				action: "review",
			})),
		},
	};
	if (!hasResumePreviewContent(snapshot.data)) return { results, pdfReport: null };
	try {
		const artifact = await artifactFactory(snapshot, { signal });
		const { report } = await runAtsCheck(blobToPdfFile(artifact.blob, "resume.pdf"), { signal });
		results.pdf = pdfReadiness(
			{ ...source, contentHash: artifact.inputHash, bytesHash: artifact.bytesHash, versions: artifact.versions },
			report,
		);
		return { results, pdfReport: report };
	} catch {
		signal.throwIfAborted();
		results.pdf = { ...emptyReadiness("pdf"), state: "failed", source: null, checkedAt: null };
		return { results, pdfReport: null };
	}
}
