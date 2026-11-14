import { expect, it } from "vite-plus/test";
import { analysisIdentitySchema, jobSpanSchema, saveJobTargetInputSchema, JOB_TEXT_LIMIT } from "./job-evidence";

it("preserves exact pasted text and bounds jobs without trimming source bytes", () => {
	const input = { role: "Engineer", text: " \n React\r\n SAP  " };
	expect(saveJobTargetInputSchema.parse(input).text).toBe(input.text);
	for (const text of ["", " \n ", "x".repeat(JOB_TEXT_LIMIT + 1)])
		expect(saveJobTargetInputSchema.safeParse({ ...input, text }).success).toBe(false);
	expect(saveJobTargetInputSchema.safeParse({ ...input, text: "x".repeat(JOB_TEXT_LIMIT) }).success).toBe(true);
});

it("rejects invalid UTF-16 span ranges and unbounded identifiers", () => {
	for (const span of [
		{ start: -1, end: 1, quote: "a" },
		{ start: 2, end: 1, quote: "a" },
		{ start: 0, end: 2, quote: "a" },
	])
		expect(jobSpanSchema.safeParse({ id: "span", ...span }).success).toBe(false);
	expect(jobSpanSchema.parse({ id: "span", start: 1, end: 3, quote: "😀" }).end).toBe(3);
});

it("requires every exact analysis identity dimension and rejects owner injection", () => {
	const identity = {
		resumeId: "cv",
		resumeRevision: "r",
		contentHash: "h",
		jobId: "job",
		jobRevision: "j",
		rubricVersion: "v",
		normalizationVersion: "n",
	};
	expect(analysisIdentitySchema.safeParse(identity).success).toBe(true);
	for (const key of Object.keys(identity)) {
		const incomplete = { ...identity };
		delete incomplete[key as keyof typeof incomplete];
		expect(analysisIdentitySchema.safeParse(incomplete).success).toBe(false);
	}
	expect(saveJobTargetInputSchema.safeParse({ role: "Engineer", text: "React", userId: "other" }).success).toBe(false);
});
