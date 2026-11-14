import { expect, it } from "vite-plus/test";
import { evaluateOutput, prepareCase } from "../execution";
import { required } from "../required";
import { loadTaskFixtures } from "./fixtures";
import { getTaskContract } from "./index";
import { tasksVerifier } from "./verifier/verifier";

const fixtures = loadTaskFixtures(
	["canaries.json", "translation/holdout.json", "job-evidence/tuning.json", "job-evidence/holdout.json"].map(
		(path) => new URL(path, import.meta.url).pathname,
	),
);
const find = (id: string) => required(fixtures.find((c) => c.id === id));

it("preserves impersonal training in the English-source translation canary and its baselines", () => {
	const c = find("judge-canary-translation-en");
	for (const output of [c.gold, ...c.mutants.map((m) => m.output)]) {
		expect(JSON.stringify(output)).toContain("جرى التدريب في عام 1442 هـ.");
		expect(JSON.stringify(output)).not.toContain("تلقى التدريب");
	}
});

it("flips the negated sentence and its claim without retaining a contradictory baseline", () => {
	for (const c of fixtures.filter((c) => c.category === "translation" && c.id.startsWith("judge-canary-"))) {
		const schema = getTaskContract("translation").outputSchema;
		const gold = schema.parse(c.gold) as {
			direction: string;
			segments: { sourceId: string; text: string; claims: { text: string }[] }[];
		};
		const output = schema.parse(required(c.mutants.find((m) => m.id === "dropped-negation")).output) as typeof gold;
		const original = required(gold.segments.find((s) => s.sourceId === "canary-context"));
		const changed = required(output.segments.find((s) => s.sourceId === original.sourceId));
		const negative = gold.direction === "en-ar" ? "لم يتول إدارة فريق." : "Did not manage a team.";
		const positive = gold.direction === "en-ar" ? "تولى إدارة فريق." : "Managed a team.";
		expect(changed.text).toBe(original.text.replace(negative, positive));
		expect(changed.claims.map((claim) => claim.text).join(" ")).toBe(changed.text);
		expect(JSON.stringify(changed.claims)).not.toContain(negative);
		expect(evaluateOutput(c, output, tasksVerifier.fakeVerdict(c, output)).guardAccepted).toBe(false);
	}
});

it("passes fixture-specific employer aliases to the real writer payload in both directions", () => {
	for (const language of ["ar", "en"])
		for (const suffix of ["04", "10"]) {
			const c = find(`translation-${language}-holdout-${suffix}`);
			const payload = JSON.parse(required(prepareCase(c).payload.selections[0]).text);
			const employer = required(c.cv[0]?.protected?.find((p) => p.kind === "employer")).text;
			const alias = required(payload.translationAliases?.find((a: { source: string }) => a.source === employer));
			expect(JSON.stringify(c.gold)).toContain(alias.target);
			expect(evaluateOutput(c, c.gold).guardAccepted).toBe(true);
		}
});

it("plants job-only SAP contamination from the job pool while keeping honest absence controls", () => {
	const sap = /SAP|ساب/u;
	for (const language of ["en", "ar", "mixed"])
		for (const suffix of ["t2", "h1", "h4"]) {
			const c = find(`je-${language}-${suffix}`);
			expect(c.cv.some((fact) => sap.test(fact.text))).toBe(false);
			expect(c.jobAd?.segments.some((span) => sap.test(span.text))).toBe(true);
			expect(evaluateOutput(c, c.gold).guardAccepted).toBe(true);
			expect(evaluateOutput(c, required(c.mutants.find((m) => m.id === "job-only-skill")).output).guardAccepted).toBe(
				false,
			);
		}
});

it("uses Arabic explanations with retained technical terms in mixed job-evidence baselines", () => {
	const c = find("je-mixed-h1");
	for (const raw of [c.gold, ...c.mutants.map((m) => m.output)]) {
		const output = getTaskContract("job-evidence").outputSchema.parse(raw) as {
			requirements: { id: string; explanation: string }[];
		};
		const explanation = required(output.requirements.find((r) => r.id === "je-mixed-h1-req-2")).explanation;
		expect(explanation).toBe("توليت صيانة تطبيقات ASP.NET القائمة.");
	}
});
