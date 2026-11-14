import { expect, it } from "vite-plus/test";
import { blindCalls, parseRatings, humanScores, arabicReviewComplete } from "./blind";
import { loadModels } from "./config";
import { cases } from "./corpus";
import { runBenchmark } from "./runner";
it("requires two Arabic scores for every production Arabic output before a decision", async () => {
	const artifact = await runBenchmark({
		models: loadModels(),
		cases: cases.filter((c) => c.language === "ar").slice(0, 2),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	const { groups, identities } = blindCalls(artifact);
	expect(
		new Set(
			Object.values(identities).flatMap((identity) =>
				(identity.members ?? [identity]).map((m) => `${m.model}@${m.reasoning}`),
			),
		).size,
	).toBe(11);
	const votes = groups
		.filter((g) => !g.repeat)
		.flatMap((g) =>
			g.outputs.flatMap((o) =>
				["one", "two"].map((reviewer) => ({
					outputId: o.id,
					reviewer,
					arabic: 4,
					fidelity: 4,
					naturalness: 4,
					notes: "",
				})),
			),
		);
	expect(arabicReviewComplete(groups, votes.slice(1))).toBe(false);
	expect(arabicReviewComplete(groups, votes)).toBe(true);
	expect(
		arabicReviewComplete(
			groups,
			votes.map((v) => ({ ...v, arabic: null })),
		),
	).toBe(false);
});

it("randomizes assignments without showing identity and preserves a private reveal map", async () => {
	const a = await runBenchmark({
		models: loadModels(undefined, undefined, false),
		cases: cases.slice(0, 1),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	const blind = blindCalls(a, () => 0);
	expect(blind.groups[0]?.outputs.map((o) => o.label)).toEqual(["A"]);
	expect(JSON.stringify(blind.groups)).not.toMatch(/openai\/|azure|together|deepseek\//);
	expect(Object.values(blind.identities).filter((i) => !i.repeatOf)).toHaveLength(1);
	expect(blind.groups[0]?.outputs[0] && blind.identities[blind.groups[0].outputs[0].id]?.members).toHaveLength(11);
});
it("rates every repetition per model/case and adds masked repeat groups without double weighting", async () => {
	const a = await runBenchmark({ models: loadModels(), cases: cases.slice(0, 5), runs: 3, fake: true, budgetUsd: 5 });
	const blind = blindCalls(a, () => 0);
	expect(blind.groups).toHaveLength(18);
	expect(blind.groups.filter((g) => g.repeat)).toHaveLength(3);
	const repeat = Object.entries(blind.identities).find(([, v]) => v.repeatOf);
	const main = Object.entries(blind.identities).find(([id]) => id === repeat?.[1].repeatOf);
	expect(main).toBeTruthy();
	expect(repeat).toBeTruthy();
	const votes = [
		{ outputId: main?.[0] ?? "", reviewer: "one", arabic: 4, fidelity: 5, naturalness: 4, notes: "", best: true },
		{ outputId: repeat?.[0] ?? "", reviewer: "one", arabic: 3, fidelity: 4, naturalness: 4, notes: "", best: true },
	];
	expect(humanScores(votes, blind.identities)[0]).toMatchObject({ count: 1, selfConsistencyWithinOne: 1 });
});
it("validates report binding, scores and duplicate reviewer votes, then computes disagreement", () => {
	const identities = { x: { model: "m", reasoning: "none" } };
	const vote = { outputId: "x", reviewer: "owner", arabic: 4, fidelity: 5, naturalness: 3, notes: "ok" };
	expect(() => parseRatings({ reportId: "other", ratings: [vote] }, "ours", identities)).toThrow();
	expect(() => parseRatings({ reportId: "ours", ratings: [{ ...vote, fidelity: 6 }] }, "ours", identities)).toThrow();
	expect(() => parseRatings({ reportId: "ours", ratings: [vote, vote] }, "ours", identities)).toThrow();
	const ratings = parseRatings(
		{ reportId: "ours", ratings: [vote, { ...vote, reviewer: "second", fidelity: 1 }] },
		"ours",
		identities,
	);
	expect(humanScores(ratings, identities)[0]).toMatchObject({ model: "m", count: 2, fidelity: 3, disagreement: 1 });
});
it("keeps rating identities stable when the same artifact is rendered again", async () => {
	const artifact = await runBenchmark({
		models: loadModels(undefined, undefined, false),
		cases: cases.slice(0, 1),
		runs: 1,
		budgetUsd: 5,
		fake: true,
	});
	const first = blindCalls(artifact, () => 0);
	const second = blindCalls(artifact, () => 0.99);
	expect(second.identities).toEqual(first.identities);
});
it("rejects duplicate reviewer aliases after trimming", () => {
	const vote = { outputId: "x", reviewer: "owner", arabic: 4, fidelity: 5, naturalness: 3, notes: "" };
	expect(() =>
		parseRatings({ reportId: "ours", ratings: [vote, { ...vote, reviewer: " owner " }] }, "ours", {
			x: { model: "m", reasoning: "none" },
		}),
	).toThrow();
});
it("samples hidden repeats across languages and checks within-one agreement without repeat bias", async () => {
	const a = await runBenchmark({
		models: loadModels().slice(0, 1),
		cases,
		runs: 1,
		fake: true,
		budgetUsd: 5,
		id: "fixed-balanced-study",
	});
	const blind = blindCalls(a, () => 0);
	expect(new Set(blind.groups.filter((g) => g.repeat).map((g) => g.language)).size).toBe(3);
	const base = Object.keys(blind.identities).find((id) => !blind.identities[id]?.repeatOf) ?? "";
	const votes = [
		{ outputId: base, reviewer: "one", arabic: 4, fidelity: 4, naturalness: 4, notes: "" },
		{ outputId: base, reviewer: "two", arabic: 3, fidelity: 5, naturalness: 4, notes: "" },
	];
	expect(humanScores(votes, blind.identities)[0]).toMatchObject({ agreementWithinOne: 1, reviewers: 2 });
});
