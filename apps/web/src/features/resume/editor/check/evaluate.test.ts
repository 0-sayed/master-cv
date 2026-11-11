import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { evaluateReadiness } from "./evaluate";
it("keeps structured writing results when the PDF renderer fails", async () => {
	const result = await evaluateReadiness(
		{
			identity: { ownerId: "alice", resumeId: "cv", baseRevision: "v1", editGeneration: 1 },
			data: { ...structuredClone(defaultResumeData), summary: { ...defaultResumeData.summary, content: "Engineer" } },
		},
		AbortSignal.timeout(5000),
		async () => {
			throw new Error("font failed");
		},
	);
	expect(result.results.pdf.state).toBe("failed");
	expect(result.results.writing.state).toBe("complete");
	expect(result.results.writing.source?.ownerId).toBe("alice");
	expect(result.results.job.state).toBe("not-checked");
});

it.each(["", "Account Name"])("leaves an empty CV (%s) not checked without requesting a PDF", async (name) => {
	let requested = false;
	const data = structuredClone(defaultResumeData);
	data.basics.name = name;
	const result = await evaluateReadiness(
		{ identity: { ownerId: "alice", resumeId: "cv", baseRevision: "v1", editGeneration: 1 }, data },
		AbortSignal.timeout(5000),
		async () => {
			requested = true;
			throw new Error("No document to render");
		},
	);
	expect(result.results.pdf.state).toBe("not-checked");
	expect(result.pdfReport).toBeNull();
	expect(requested).toBe(false);
	expect(result.results.writing.state).toBe("complete");
});
