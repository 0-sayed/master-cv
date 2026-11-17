import { createHash } from "node:crypto";
import { expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ freeze: {} as Record<string, unknown>, amendment: {} as Record<string, unknown> }));
vi.mock("./tasks-study.json", () => ({ default: state.freeze }));
vi.mock("./billing-amendment.json", () => ({ default: state.amendment }));
import { assertFrozenStudy } from "./freeze";
import { required } from "./required";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const paths = ["attempt.ts", "production.ts", "runner.ts", "verifier.ts", "freeze.ts", "cli.ts"].map(
	(f) => `tooling/evaluations/review/${f}`,
);
function setup(sealed = "before") {
	Object.assign(state.freeze, {
		studyId: "synthetic-study",
		files: Object.fromEntries(paths.map((p) => [p, sha(sealed)])),
		holdoutHash: sha("holdout"),
		holdoutPassagesHash: sha("passages"),
	});
	Object.assign(state.amendment, {
		owner: "Sayed",
		studyId: "synthetic-study",
		runtimeSha256: sha("runtime"),
		revisions: Object.fromEntries(paths.map((p) => [p, { before: sha("before"), after: sha("after") }])),
	});
	return (path: string) =>
		Buffer.from(
			path.endsWith("billing-runtime.ts")
				? "runtime"
				: path.endsWith("holdout.json")
					? "holdout"
					: path.endsWith("holdout-passages.json")
						? "passages"
						: "after",
		);
}
it("accepts the exact approved billing amendment over the original sealed bytes", () => {
	expect(assertFrozenStudy(setup(), "tasks-v1")).toBe(state.freeze);
});
it("rejects stale billing metadata even when all sealed bytes match", () => {
	const read = setup("after");
	state.amendment.studyId = "stale-study";
	expect(() => assertFrozenStudy(read, "tasks-v1")).toThrow("STUDY_FREEZE_CHANGED");
	setup("after");
	required((state.amendment.revisions as Record<string, { after: string }>)[required(paths[0])]).after = sha("stale");
	expect(() => assertFrozenStudy(read, "tasks-v1")).toThrow("STUDY_FREEZE_CHANGED");
});
