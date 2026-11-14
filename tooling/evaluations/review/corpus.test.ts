import { expect, it } from "vite-plus/test";
import { cases, prepareCase, goldOutput, evaluateOutput } from "./corpus";
import holdoutPassages from "./holdout-passages.json";
import { required } from "./required";
import tuningPassages from "./tuning-passages.json";

it("keeps supporting roles in every authored and derived gold answer", () => {
	for (const passage of [...tuningPassages, ...holdoutPassages]) {
		if (/\b(?:helped|assisted|supported)\b|ساعدت|دعمت/iu.test(passage.input)) {
			expect(passage.safe, passage.id).toMatch(/\b(?:helped|assisted|supported)\b|ساعدت|دعمت/iu);
		}
		for (const c of cases.filter((c) => c.passageId === passage.id)) {
			expect(c.safeText, c.id).toBe(passage.safe);
		}
	}
});

it("keeps dated work histories newest first without changing role/date facts", () => {
	for (const [id, newest, oldest] of [
		["r2-t03", "١٤٤١", "١٤٣٩"],
		["r2-h04", "٢٠٢٤", "٢٠٢١"],
	] as const) {
		const passage = required([...tuningPassages, ...holdoutPassages].find((p) => p.id === id));
		expect(passage.input.indexOf(oldest), id).toBeLessThan(passage.input.indexOf(newest));
		expect(passage.safe.indexOf(newest), id).toBeLessThan(passage.safe.indexOf(oldest));
		for (const fact of passage.facts) expect(passage.safe, id).toContain(fact);
	}
});

it("keeps 84 cases across 24 distinct passages and separate holdout", () => {
	expect(cases).toHaveLength(84);
	expect(new Set(cases.map((c) => c.passageId)).size).toBe(24);
	expect(cases.filter((c) => c.holdout)).toHaveLength(48);
	expect(new Set(cases.map((c) => c.category))).toEqual(
		new Set(["wording", "extraction", "missing-info", "injection"]),
	);
	for (const c of cases) {
		expect(c.input.split(/[.!؟]/u).filter((s) => s.trim()).length, c.id).toBeGreaterThanOrEqual(2);
		expect(prepareCase(c).handler.output.safeParse(goldOutput(c)).success, c.id).toBe(true);
		// The dedicated sealed-control test evaluates held-out quality exactly once.
		if (!c.holdout) expect(evaluateOutput(c, goldOutput(c)).usefulnessMiss, c.id).toBe(false);
	}
});
it("runs real fact and claim-strength guards against invented responsibility", () => {
	const c = required(cases.find((c) => !c.holdout && c.sector === "education" && c.category === "wording"));
	const raw = goldOutput(c);
	const hostile = {
		...raw,
		proposals: [
			{
				id: "p",
				passageId: "selected",
				text: "Led the team.",
				claims: [{ id: "c", text: "Led the team.", evidenceIds: ["selected"] }],
				reason: "Clearer",
				evidenceIds: ["selected"],
			},
		],
	};
	expect(evaluateOutput(c, hostile)).toMatchObject({
		schemaValid: true,
		guardAccepted: false,
		guardError: "AI_UNSUPPORTED_CLAIM",
	});
});
it("does not award empty answers full coverage and requires questions instead of guessing", () => {
	const c = required(cases.find((c) => c.category === "missing-info"));
	const score = evaluateOutput(c, { proposals: [], questions: [], notes: [] });
	expect(score.missingQuestion).toBe(true);
	const facts = required(cases.find((c) => !c.holdout && c.sector === "education" && c.category === "wording"));
	expect(evaluateOutput(facts, { proposals: [], questions: [], notes: [] }).score?.lostFacts.length).toBe(0);
	expect(evaluateOutput(facts, { proposals: [], questions: [], notes: [] }).usefulnessMiss).toBe(true);
	const copied = goldOutput({ ...facts, safeText: facts.input });
	expect(evaluateOutput(facts, copied)).toMatchObject({ guardAccepted: true, usefulnessMiss: true });
});
it("keeps production prompt/schema and sanitized payload rather than prompt copies", () => {
	const prepared = prepareCase(required(cases.find((c) => c.kind === "extraction")));
	expect(prepared.handler.promptVersion).toBe("t006-extraction-v5");
	expect(prepared.payload.selections[0]).toMatchObject({ id: "selected", kind: "unconfirmed_source" });
});
it("reports missing questions separately without inventing a production guard rejection", () => {
	const c = required(cases.find((c) => c.category === "missing-info"));
	const result = evaluateOutput(c, {
		...goldOutput({ ...c, requiresQuestion: false, safeText: c.input }),
		questions: [],
	});
	expect(result.guardAccepted).toBe(true);
	expect(result.missingQuestion).toBe(true);
});
