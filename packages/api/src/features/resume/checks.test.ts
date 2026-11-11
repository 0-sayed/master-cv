import { beforeEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ get: vi.fn(), extract: vi.fn() }));
vi.mock("./service", () => ({ resumeService: { getById: mocks.get } }));
vi.mock("./pdf-analysis", () => ({ extractPdf: mocks.extract }));
vi.mock("@reactive-resume/resume/ats-pdf", () => ({ analyzePdfResume: () => ({ synthetic: true }) }));
import { checkOwnedPdf } from "./check-owned-pdf";
const input = () => ({
	resumeId: "cv",
	expectedUpdatedAt: new Date("2026-11-11"),
	file: new File(["%PDF-synthetic"], "private.pdf"),
	artifact: {
		bytesHash: "f".repeat(64),
		inputHash: "a".repeat(64),
		editGeneration: 1,
		versions: { renderer: "r", template: "t", fonts: "f", locale: "en-US" },
	},
});
beforeEach(() => {
	vi.clearAllMocks();
	mocks.get.mockResolvedValue({ updatedAt: new Date("2026-11-11") });
	mocks.extract.mockResolvedValue({});
});
it("denies foreign/trashed resources before reading the uploaded bytes", async () => {
	mocks.get.mockRejectedValue({ code: "NOT_FOUND" });
	await expect(checkOwnedPdf("alice", input())).rejects.toMatchObject({ code: "NOT_FOUND" });
	expect(mocks.extract).not.toHaveBeenCalled();
});
it("refuses a stale baseline before extraction", async () => {
	mocks.get.mockResolvedValue({ updatedAt: new Date("2026-11-12") });
	await expect(checkOwnedPdf("alice", input())).rejects.toMatchObject({ code: "CONFLICT" });
	expect(mocks.extract).not.toHaveBeenCalled();
});
it("recomputes bytes instead of trusting client hashes", async () => {
	await expect(checkOwnedPdf("alice", input())).rejects.toMatchObject({ code: "BAD_REQUEST" });
	expect(mocks.extract).not.toHaveBeenCalled();
});
it("discards a result when the owned revision changes while extraction is running", async () => {
	const { createHash } = await import("node:crypto");
	const args = input();
	args.artifact.bytesHash = createHash("sha256")
		.update(Buffer.from(await args.file.arrayBuffer()))
		.digest("hex");
	mocks.get
		.mockResolvedValueOnce({ updatedAt: args.expectedUpdatedAt })
		.mockResolvedValueOnce({ updatedAt: new Date("2026-11-12") });
	await expect(checkOwnedPdf("alice", args)).rejects.toMatchObject({ code: "CONFLICT" });
	expect(mocks.extract).toHaveBeenCalledTimes(1);
});
it("binds a successful result to actual owned bytes and retains no extracted text", async () => {
	const { createHash } = await import("node:crypto");
	const args = input();
	args.artifact.bytesHash = createHash("sha256")
		.update(Buffer.from(await args.file.arrayBuffer()))
		.digest("hex");
	const result = await checkOwnedPdf("alice", args);
	expect(result.source).toMatchObject({ ownerId: "alice", resumeId: "cv", bytesHash: args.artifact.bytesHash });
	expect(result).not.toHaveProperty("fullText");
});
