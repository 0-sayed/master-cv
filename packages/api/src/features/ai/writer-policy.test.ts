import { expect, it } from "vite-plus/test";
import { syntheticReviewRuntime } from "./testing/runtime";
import { resolveWriterRoute } from "./writer-policy";
const route = syntheticReviewRuntime.routes[0];
if (!route || !route.verifier) throw new Error("Missing synthetic route");
const verifier = route.verifier;
it("narrows the writer without shrinking the implicit verifier cap", () => {
	const selected = resolveWriterRoute(
		{ ...route, maxOutputTokens: 8192 },
		{ kind: "review.job-evidence", parameters: {} },
	);
	expect(selected.maxOutputTokens).toBe(512);
	expect(selected.verifier?.maxOutputTokens).toBe(8192);
});
it("preserves an explicit verifier cap", () => {
	const selected = resolveWriterRoute(
		{ ...route, maxOutputTokens: 8192, verifier: { ...verifier, maxOutputTokens: 12288 } },
		{ kind: "review.job-evidence", parameters: {} },
	);
	expect(selected.maxOutputTokens).toBe(512);
	expect(selected.verifier?.maxOutputTokens).toBe(12288);
});
