import { expect, it } from "vite-plus/test";
import { runQualification } from "./run";
import { qualificationSuite } from "./suite";
it("qualifies actual server PDFs against both independent readers", { timeout: 300000 }, async () => {
	const results = await runQualification();
	const suite = qualificationSuite(process.env);
	expect(results).toHaveLength(
		[
			"dev-holdout-2",
			"holdout-3",
			"dev-holdout-3",
			"holdout-4",
			"dev-holdout-4",
			"holdout-5",
			"dev-holdout-5",
			"holdout-6",
		].includes(suite)
			? 20
			: suite === "matrix"
				? 54
				: suite === "pilot"
					? 50
					: 12,
	);
	expect(results.filter((result) => !result.automatedPass).map((result) => result.id)).toEqual([]);
});
