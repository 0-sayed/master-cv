import { expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { evaluateReadiness } from "./evaluate";
import { preloadAtsCheck } from "@/features/ats-checker/run-ats-check";

vi.mock("@/features/ats-checker/run-ats-check", async (original) => ({
	...(await original<typeof import("@/features/ats-checker/run-ats-check")>()),
	preloadAtsCheck: vi.fn(async () => {}),
}));

it("prefetches the analysis code while the PDF is still being generated", async () => {
	vi.mocked(preloadAtsCheck).mockClear();
	let fail!: (error: Error) => void;
	const pending = evaluateReadiness(
		{
			identity: { ownerId: "alice", resumeId: "cv", baseRevision: "v1", editGeneration: 0 },
			data: { ...structuredClone(defaultResumeData), summary: { ...defaultResumeData.summary, content: "Engineer" } },
		},
		new AbortController().signal,
		() =>
			new Promise((_resolve, reject) => {
				fail = reject;
			}),
	);
	await vi.waitFor(() => expect(fail).toBeDefined());
	expect(preloadAtsCheck).toHaveBeenCalledTimes(1);
	fail(new Error("renderer unavailable"));
	await expect(pending).resolves.toMatchObject({ results: { writing: { state: "complete" } } });
});
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
