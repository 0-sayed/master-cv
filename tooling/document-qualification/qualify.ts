import type { QualificationCase, QualificationPolicy } from "./types";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { harvestPdfDocument, analyzePdfResume } from "@reactive-resume/resume/ats-pdf";
import { compareQualification } from "./compare";
import { expectedDisplayGold } from "./expected-gold";
import { extractQualificationPdf } from "./extract";
export async function qualifyCase(
	input: QualificationCase,
	directory: string,
	policy: QualificationPolicy = "strict v1",
) {
	const started = performance.now();
	const file = await act(() => createResumePdfFile({ data: input.data, filename: `${input.id}.pdf` }));
	const bytes = new Uint8Array(await file.arrayBuffer());
	return qualifyPdf(input, bytes, directory, "server-export", started, policy);
}

/** Qualify saved bytes through the same readers, comparator and ATS gate as the server path. */
async function qualifyPdf(
	input: QualificationCase,
	bytes: Uint8Array,
	directory: string,
	path: string,
	started = performance.now(),
	policy: QualificationPolicy = "strict v1",
) {
	const displayGold = expectedDisplayGold(input);
	const hash = createHash("sha256").update(bytes).digest("hex");
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, `${input.id}.pdf`), bytes);
	const readers = await extractQualificationPdf(bytes);
	const evidence = readers.map((reader) => ({
		...reader,
		comparison:
			reader.status === "complete"
				? compareQualification(policy === "fact-level v2.1" ? displayGold : input.gold, reader.text, policy)
				: null,
		comparisons: {
			"fact-level v2.1":
				reader.status === "complete" ? compareQualification(displayGold, reader.text, "fact-level v2.1") : null,
			"strict v1": reader.status === "complete" ? compareQualification(input.gold, reader.text, "strict v1") : null,
			"fact-level v2":
				reader.status === "complete" ? compareQualification(input.gold, reader.text, "fact-level v2") : null,
		},
	}));
	const task = getDocument({ data: Uint8Array.from(bytes), fontExtraProperties: true });
	let report;
	try {
		const raw = await harvestPdfDocument(await task.promise, {
			file: { name: `${input.id}.pdf`, sizeBytes: bytes.length, magicBytesOk: true },
		});
		report = analyzePdfResume(raw, { locale: input.data.metadata.page.locale, now: new Date("2024-06-15T00:00:00Z") });
	} finally {
		await task.destroy();
	}
	const result = {
		policy,
		id: input.id,
		language: input.language,
		split: input.split,
		path,
		template: input.data.metadata.template,
		font: input.data.metadata.typography.body.fontFamily,
		sha256: hash,
		durationMs: performance.now() - started,
		pageCount: report.document.pageCount,
		analysis: report,
		pdfjsParseCount: 2,
		candidateFalseBlockers: report.findings
			.filter((finding) => finding.severity === "blocker")
			.map((finding) => finding.code),
		acceptance: "pending-review",
		automatedPass:
			report.analysis?.status === "complete" &&
			!report.findings.some((finding) => finding.severity === "blocker") &&
			evidence
				.filter((reader) => reader.reader !== "poppler-layout")
				.every((reader) => reader.status === "complete" && reader.comparison?.passed),
		readers: evidence,
		expectedDisplayGold: displayGold,
		automatedPassByPolicy: Object.fromEntries(
			(["strict v1", "fact-level v2", "fact-level v2.1"] as const).map((policy) => [
				policy,
				report.analysis?.status === "complete" &&
					!report.findings.some((finding) => finding.severity === "blocker") &&
					evidence
						.filter((reader) => reader.reader !== "poppler-layout")
						.every((reader) => reader.status === "complete" && reader.comparisons[policy]?.passed),
			]),
		),
	};
	await writeFile(join(directory, `${input.id}.json`), JSON.stringify(result, null, 2));
	return result;
}
