import { expect, it } from "vite-plus/test";
import { assertHardFacts } from "@reactive-resume/api/features/ai/hard-facts";
import examples from "./class-tuning.json";
import { cases, evaluateOutput, goldOutput } from "./corpus";
import { required } from "./required";

it.each(examples)("accepts independent honest $id", (p) => {
	expect(() => assertHardFacts(p.honest, p.honest, p.source)).not.toThrow();
});
it.each(examples.filter((p) => p.attack))("rejects independent qualifier substitution $id", (p) => {
	expect(() => assertHardFacts(required(p.attack), required(p.attack), p.source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it.each(examples.filter((p) => p.errorClass === "date-role-fragment"))(
	"accepts split header through production $id",
	(p) => {
		const base = required(cases.find((c) => !c.holdout && c.kind === "wording" && !c.requiresQuestion));
		const c = {
			...base,
			input: p.source,
			safeText: p.source,
			requiredFacts: [],
			forbiddenClaims: [],
			forbiddenPatterns: [],
			improvementExpected: false,
		};
		const output = goldOutput(c);
		if (!Array.isArray(output.proposals)) throw new Error("Expected wording fixture proposals");
		const proposal = required(output.proposals[0]);
		const at = p.source.indexOf(p.honest);
		proposal.claims = [p.source.slice(0, at), p.honest, p.source.slice(at + p.honest.length)]
			.filter((s) => s.trim())
			.map((text, i) => ({ id: `c${i}`, text: text.trim(), evidenceIds: ["selected"] }));
		expect(evaluateOutput(c, output)).toMatchObject({ schemaValid: true, guardAccepted: true });
	},
);
it.each([
	["Engineer, 2012; teacher, 2014.", "Teacher, 2012; engineer, 2014."],
	["مهندس، ٢٠١٣؛ معلم، ٢٠١٧.", "معلم، ٢٠١٣؛ مهندس، ٢٠١٧."],
])("keeps explicit role dates bound", (source, after) => {
	expect(() => assertHardFacts(source, after, source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it.each([
	["Technician from 2011 to 2016.", "From 2016 to 2011."],
	["فني من ٢٠١٠ الى ٢٠١٥.", "من ٢٠١٥ الى ٢٠١٠."],
])("retains explicit date endpoints even without a role", (source, after) => {
	expect(() => assertHardFacts(after, after, source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it("never borrows an unrelated modifier for a credential", () => {
	const source = "Reviewed safety schedules. Held a finance certificate.";
	expect(() => assertHardFacts("Safety certificate.", "Safety certificate.", source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it.each([
	["Certified crane operator.", "Certified boiler operator."],
	["شهادة لغة إنجليزية.", "شهادة لغة ألمانية."],
])("binds post-head credential modifiers", (source, after) => {
	expect(() => assertHardFacts(after, after, source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it("accepts an honest credential label moved before its head", () => {
	expect(() =>
		assertHardFacts("Food hygiene certificate.", "Food hygiene certificate.", "Certificate: food hygiene."),
	).not.toThrow();
});
