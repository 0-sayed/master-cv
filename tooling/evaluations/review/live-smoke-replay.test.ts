import type { ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { cases, prepareCase } from "./corpus";
import { validateReviewResult } from "./production";
import { required } from "./required";
import { scoreReviewCase } from "./score";

const replay: { honestOutputs: { index: number; caseId: string; result: ReviewResult }[] } = JSON.parse(
	readFileSync(new URL("./live-smoke-replay.json", import.meta.url), "utf8"),
);
it.each(replay.honestOutputs)(
	"accepts recorded honest output $index without losing rephrased facts",
	({ caseId, result }) => {
		const c = required(cases.find((c) => c.id === caseId));
		expect(() => validateReviewResult(prepareCase(c).snapshot, result)).not.toThrow();
		expect(scoreReviewCase(prepareCase(c).gold, result).unsupportedClaims).toEqual([]);
		expect(scoreReviewCase(prepareCase(c).gold, result).lostFacts).toEqual([]);
	},
);
