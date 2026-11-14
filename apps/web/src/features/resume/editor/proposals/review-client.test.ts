import { describe, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
vi.mock("@/features/resume/builder/draft", () => ({ useResumeStore: {}, savePendingChanges: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ client: {} }));
import { createReviewDecisionSubmitter } from "./review-client";

const input = {
	operationId: "op",
	proposalIds: ["p"],
	requestKey: "key",
	expectedUpdatedAt: "2026-11-12T00:00:00.000Z",
	decision: "accept" as const,
};
const response = {
	decisionId: "d",
	operationId: "op",
	statuses: { p: "accepted" as const },
	resumeId: "cv",
	updatedAt: "2026-11-12T00:00:01.000Z",
	data: defaultResumeData,
};
function fixture() {
	let generation = 1;
	const replace = vi.fn((_view, expected: number) => expected === generation);
	const rpc = vi.fn(async () => response);
	const flush = vi.fn(async () => true);
	const submit = createReviewDecisionSubmitter({
		flush,
		current: () => ({ id: "cv", revision: input.expectedUpdatedAt, generation }),
		replace,
		rpc,
	});
	return {
		submit,
		replace,
		rpc,
		flush,
		type: () => {
			generation += 1;
		},
	};
}
describe("review decision coordinator", () => {
	it("blocks a failed draft flush before making a decision request", async () => {
		const f = fixture();
		f.flush.mockResolvedValue(false);
		await expect(f.submit(input)).rejects.toThrow("AI_REVIEW_SAVE_REQUIRED");
		expect(f.rpc).not.toHaveBeenCalled();
		expect(f.replace).not.toHaveBeenCalled();
	});
	it("protects newer typing while a server response is pending", async () => {
		const f = fixture();
		f.rpc.mockImplementation(async () => {
			f.type();
			return response;
		});
		await expect(f.submit(input)).rejects.toThrow("AI_REVIEW_LOCAL_CONFLICT");
		expect(f.replace).toHaveBeenCalledWith(response, 1);
	});
	it("never acknowledges a failed request", async () => {
		const f = fixture();
		f.rpc.mockRejectedValue(new Error("offline"));
		await expect(f.submit(input)).rejects.toThrow("offline");
		expect(f.replace).not.toHaveBeenCalled();
	});
	it("uses the flushed current revision and acknowledges only the server response", async () => {
		const f = fixture();
		expect(await f.submit(input)).toEqual(response);
		expect(f.rpc).toHaveBeenCalledWith(input);
		expect(f.replace).toHaveBeenCalledWith(response, 1);
	});
});
