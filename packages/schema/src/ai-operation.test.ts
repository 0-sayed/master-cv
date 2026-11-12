import { describe, expect, it } from "vite-plus/test";
import { operationRequestSchema, operationViewSchema, canTransitionOperation } from "./ai-operation";

describe("durable AI contracts", () => {
	it("accepts bounded immutable requests and rejects extra authority or unbounded identifiers", () => {
		const request = {
			requestKey: "request-1",
			kind: "review",
			sources: [{ kind: "resume", id: "cv", revision: "v1" }],
			route: { routeId: "r", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
			parameters: {},
		};
		expect(operationRequestSchema.parse(request)).toEqual(request);
		for (const change of [{ userId: "bob" }, { requestKey: "" }, { requestKey: "x".repeat(201) }, { sources: [] }])
			expect(operationRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
	});
	it("requires a delivered result and forbids cancellation or execution after delivery", () => {
		expect(
			operationViewSchema.safeParse({ id: "op", state: "succeeded", resultId: null, failureCode: null }).success,
		).toBe(false);
		expect(canTransitionOperation("queued", "running")).toBe(true);
		expect(canTransitionOperation("running", "cancel_requested")).toBe(true);
		expect(canTransitionOperation("cancel_requested", "waiting_review")).toBe(false);
		expect(canTransitionOperation("waiting_review", "succeeded")).toBe(true);
		expect(canTransitionOperation("succeeded", "cancelled")).toBe(false);
	});
});
