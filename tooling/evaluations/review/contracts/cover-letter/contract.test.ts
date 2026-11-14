import type { TaskCase } from "../types";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { z } from "zod";
import { loadModels } from "../../config";
import { cases as coreCases } from "../../corpus";
import { assertTaskGoldFits, evaluateOutput, prepareCase } from "../../execution";
import { appendEvent, readJournal } from "../../journal";
import { assertStrictOutputSchema, preflightRequests } from "../../preflight";
import { required } from "../../required";
import { runBenchmark } from "../../runner";
import { controls } from "../../study";
import { loadTaskFixtures, taskReviewItems } from "../fixtures";
import { getTaskContract } from "../index";
import { tasksVerifierSchema } from "../verifier/schema";
import { tasksVerifier } from "../verifier/verifier";
import {
	coverLetterContract,
	coverLetterHardFactsVersion,
	coverLetterOutputSchema,
	countLetterWords,
	renderPlainText,
	restoreCoverLetterNames,
	type CoverLetterOutput,
} from "./contract";

const fixtures = () =>
	loadTaskFixtures([
		new URL("./tuning.json", import.meta.url).pathname,
		new URL("./holdout.json", import.meta.url).pathname,
	]);
const example = () => {
	const c = required(fixtures().find((c) => c.language === "en"));
	return { c, o: coverLetterOutputSchema.parse(c.gold) };
};
const score = (c: TaskCase, o: CoverLetterOutput) => coverLetterContract.score(c, o, null);

it("registers a strict draft preserving production body rules and excluding revision modes", () => {
	expect(getTaskContract("cover-letter")).toBe(coverLetterContract);
	assertStrictOutputSchema(z.toJSONSchema(coverLetterOutputSchema));
	expect(coverLetterContract.guardPolicy).toEqual({ lostFact: false, subsetEntities: true });
	expect(coverLetterContract.systemPrompt).toMatch(/180.*320/u);
	expect(coverLetterContract.systemPrompt).toContain("T007/T008");
	expect(coverLetterContract.systemPrompt).toContain("posting");
	const { c, o } = example();
	expect(coverLetterContract.verifierContext(c, o)).toMatchObject({ retention: "not_applicable", absenceChecks: [] });
	expect(renderPlainText(o)).toBe(o.paragraphs.map((p) => p.text).join("\n\n"));
	expect(score(c, o)).toMatchObject({ safetyDeterministic: { pass: true }, lostFacts: [] });
	expect(coverLetterOutputSchema.safeParse({ ...o, extra: true }).success).toBe(false);
});

it("counts whitespace words without splitting Arabic clitics or counting isolated punctuation", () => {
	expect(countLetterWords("وبالعمل وللتعاون في الرياض، ثم نلتقي. — ،")).toBe(6);
	for (const n of [179, 180, 320, 321]) {
		const { c, o } = example();
		required(o.paragraphs[0]).text = "work ".repeat(n - 2).trim();
		required(o.paragraphs[0]).claims = [];
		required(o.paragraphs[1]).text = "work";
		required(o.paragraphs[1]).claims = [];
		required(o.paragraphs[2]).text = "work";
		required(o.paragraphs[2]).claims = [];
		expect(score(c, o).quality.pass).toBe(n >= 180 && n <= 320);
	}
});

it("validates claims at complete sentence boundaries and checks coverage independently", () => {
	const { c, o } = example();
	const claim = required(o.paragraphs.flatMap((p) => p.claims)[0]);
	expect(coverLetterContract.claims(c, o).map((v) => v.id)).toContain(claim.id);
	claim.text = claim.text.slice(0, -4);
	expect(score(c, o).safetyDeterministic.pass).toBe(false);
	const clean = example().o;
	required(clean.paragraphs[1]).text += " I increased revenue by 70%.";
	const verdict = tasksVerifierSchema.parse(tasksVerifier.fakeVerdict({ ...c, gold: clean }, clean));
	verdict.coverage = { status: "uncovered", reason: "An additional candidate assertion has no annotation." };
	expect(coverLetterContract.score(c, clean, verdict).safetyDeterministic.pass).toBe(false);
	expect(JSON.stringify(tasksVerifier.buildInput(c, clean))).toContain("I increased revenue");
});

it("rejects invented achievements, job-only SAP evidence, escalation and negation loss", () => {
	for (const text of ["I increased revenue by 70%.", "I used SAP.", "I led a team of 12."]) {
		const { c, o } = example();
		const p = required(o.paragraphs.find((p) => p.claims.length));
		p.text = text;
		p.claims = [{ id: "attack", text, evidenceIds: [required(c.cv[0]).id], kind: "fact" }];
		expect(score(c, o).safetyDeterministic.pass, text).toBe(false);
		required(p.claims[0]).evidenceIds = [required(required(c.jobAd).segments[0]).id];
		expect(score(c, o).safetyDeterministic.pass).toBe(false);
	}
	const { c, o } = example();
	const p = required(o.paragraphs.find((p) => p.claims.length));
	c.cv = [{ id: "negated", section: "experience", text: "Did not manage a team." }];
	p.text = "Managed a team.";
	p.claims = [{ id: "negated-claim", text: p.text, evidenceIds: ["negated"], kind: "fact" }];
	expect(score(c, o).safetyDeterministic.pass).toBe(false);
});

it.each(["ar", "en", "mixed"])("scores the opening bridge with separate job-span citations in %s", (language) => {
	const c = required(fixtures().find((c) => c.language === language));
	const o = coverLetterOutputSchema.parse(c.gold);
	const bridge = required(
		o.paragraphs.flatMap((p) => p.claims).find((claim) => claim.id === "experience-role-connection"),
	);
	Object.assign(bridge, { jobSpanIds: ["job-duty"] });
	expect(coverLetterOutputSchema.safeParse(o).success).toBe(true);
	expect(score(c, o).safetyDeterministic.pass).toBe(true);
	const paragraph = required(o.paragraphs.find((p) => p.claims.includes(bridge)));
	paragraph.text = paragraph.text.replace(bridge.text, "خبرتي في SAP المطلوبة في إعلانكم.");
	bridge.text = "خبرتي في SAP المطلوبة في إعلانكم.";
	expect(score(c, o).safetyDeterministic.pass).toBe(false);
});

it("rejects placeholders, greetings, sign-offs and formatted bodies", () => {
	for (const text of [
		"[Company]",
		"{{company}}",
		"<company>",
		"Dear hiring manager,",
		"Kind regards,",
		"السلام عليكم،",
		"مع خالص التحية،",
		"# Application",
		"- Skills",
	]) {
		const { c, o } = example();
		required(o.paragraphs[0]).text = text + " " + required(o.paragraphs[0]).text;
		expect(score(c, o).safetyDeterministic.pass, text).toBe(false);
	}
});

it("enforces D22 without banning supported achievement percentages", () => {
	for (const text of [
		"Your ATS score is 95%.",
		"My match percentage is 90%.",
		"My hiring probability is high.",
		"You do not know SAP.",
		"درجة المطابقة 90%.",
		"أنت لا تجيد ساب.",
	]) {
		const { c, o } = example();
		o.notes.push(text);
		expect(score(c, o).safetyDeterministic.pass, text).toBe(false);
	}
	const { c, o } = example();
	const p = required(o.paragraphs.find((p) => p.claims.length));
	p.text = "Reduced errors by 15%.";
	p.claims = [{ id: "metric", text: p.text, evidenceIds: ["metric-source"], kind: "fact" }];
	c.cv.push({ id: "metric-source", section: "experience", text: p.text });
	expect(score(c, o).safetyDeterministic.pass).toBe(true);
});

it("audits evidence ids, stable unique claim ids and verifier safety while quality stays advisory", () => {
	const { c, o } = example();
	const p = required(o.paragraphs.find((p) => p.claims.length));
	p.claims.push(structuredClone(required(p.claims[0])));
	expect(score(c, o).safetyDeterministic.pass).toBe(false);
	const clean = example().o;
	const verdict = tasksVerifier.fakeVerdict(c, clean);
	expect(coverLetterContract.score(c, clean, verdict).safetyDeterministic.pass).toBe(true);
	expect(coverLetterContract.score(c, clean, { ...verdict, verdicts: [] }).safetyDeterministic.pass).toBe(false);
	expect(
		coverLetterContract.score(c, clean, { ...verdict, quality: { status: "inappropriate", reason: "Style only." } })
			.safetyDeterministic.pass,
	).toBe(true);
	required(clean.paragraphs.flatMap((p) => p.claims)[0]).evidenceIds = ["missing"];
	expect(score(c, clean).safetyDeterministic.pass).toBe(false);
});

it("minimizes contacts and protected names and restores locally without mutation", () => {
	const { c, o } = example();
	c.cv.push({
		id: "identity",
		section: "summary",
		text: "Noura Al-Madar noura@example.test +966501234567",
		protected: [{ kind: "name", text: "Noura Al-Madar" }],
	});
	const payload = JSON.stringify(prepareCase(c).payload);
	for (const secret of ["Noura Al-Madar", "noura@example.test", "+966501234567"]) expect(payload).not.toContain(secret);
	expect(payload).toContain("[NAME_1]");
	o.notes = ["[NAME_1]"];
	const before = structuredClone(o);
	expect(restoreCoverLetterNames(c, o).notes).toEqual(["Noura Al-Madar"]);
	expect(o).toEqual(before);
});

it("authors nine tuning and eight holdout per language plus mixed, with honest and unsafe controls", () => {
	const cases = fixtures();
	expect(cases.filter((c) => !c.holdout).length).toBeGreaterThanOrEqual(9);
	for (const language of ["ar", "en"])
		expect(cases.filter((c) => c.holdout && c.language === language).length).toBeGreaterThanOrEqual(8);
	expect(cases.some((c) => c.holdout && c.language === "mixed")).toBe(true);
	for (const c of cases) {
		const o = coverLetterOutputSchema.parse(c.gold);
		expect(countLetterWords(renderPlainText(o)), c.id).toBeGreaterThanOrEqual(180);
		expect(countLetterWords(renderPlainText(o)), c.id).toBeLessThanOrEqual(320);
		expect(score(c, o).safetyDeterministic.pass, c.id).toBe(true);
		expect(score(c, o).quality.pass, c.id).toBe(true);
		expect(c.mutants.some((m) => m.expect === "honest")).toBe(true);
		expect(c.mutants.some((m) => m.expect === "unsafe")).toBe(true);
		for (const m of c.mutants) {
			const output = coverLetterOutputSchema.parse(m.output);
			if (!score(c, output).safetyDeterministic.pass) {
				expect(m.expect, `${c.id}:${m.id}`).toBe("unsafe");
				continue;
			}
			const oracle = m.expect === "honest" ? { ...c, gold: output } : c;
			expect(
				coverLetterContract.score(c, output, tasksVerifier.fakeVerdict(oracle, output)).safetyDeterministic.pass,
				`${c.id}:${m.id}`,
			).toBe(m.expect === "honest");
		}
	}
	expect(
		taskReviewItems(cases, [
			{
				category: "cover-letter",
				task: "Draft the letter body; revision modes out of scope.",
				systemPrompt: coverLetterContract.systemPrompt,
				promptVersion: coverLetterContract.promptVersion,
				schemaVersion: coverLetterContract.schemaVersion,
			},
		]),
	).toHaveLength(cases.length);
});

it("fits every gold below half the visible cap for every effort", () => {
	for (const c of fixtures())
		for (const effort of ["none", "low", "medium", "high"] as const) {
			expect(
				() => assertTaskGoldFits(c, { maxOutputTokens: coverLetterContract.visibleCap(effort) }),
				c.id,
			).not.toThrow();
		}
});

it("preflights and runs all languages through fake transport and journal round-trip", async () => {
	const cases = fixtures();
	const models = loadModels().slice(0, 1);
	const preflight = await preflightRequests(models, cases);
	expect(preflight.requests).toHaveLength(cases.length * 2);
	const roles: string[] = [];
	const run = await runBenchmark({
		models,
		cases,
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		fakeTransport: async (_url, _init, next, context) => {
			roles.push(context.role);
			return next();
		},
	});
	expect(run.stopReason).toBeNull();
	expect(run.calls).toHaveLength(cases.length);
	expect(roles.filter((role) => role === "writer")).toHaveLength(cases.length);
	for (const call of run.calls)
		expect(call).toMatchObject({
			schemaValid: true,
			guardAccepted: true,
			verifierAccepted: true,
			safetyAccepted: true,
		});
	const folder = await mkdtemp(join(tmpdir(), "t006-letter-"));
	try {
		const path = join(folder, "calls.jsonl");
		for (const call of run.calls) await appendEvent(path, { type: "scored", data: call });
		expect((await readJournal(path)).previousCalls).toEqual(run.calls);
	} finally {
		await rm(folder, { recursive: true });
	}
	expect(evaluateOutput(example().c, { paragraphs: 4 }).structuralFailure).toBe(true);
});

it("keeps sentence annotations in reading order", () => {
	const { c, o } = example();
	const p = required(o.paragraphs.find((p) => p.claims.length));
	p.claims.reverse();
	expect(score(c, o).safetyDeterministic.pass).toBe(false);
});

it("preserves negation in Arabic through independent semantic verification", () => {
	const c = required(fixtures().find((c) => c.language === "mixed" && c.cv.some((f) => f.text.includes("لم أتول"))));
	const o = coverLetterOutputSchema.parse(c.gold);
	const p = required(o.paragraphs.find((p) => p.claims.some((claim) => claim.text.includes("لم أتول"))));
	const claim = required(p.claims.find((claim) => claim.text.includes("لم أتول")));
	p.text = p.text.replace(claim.text, "توليت إدارة فريق.");
	claim.text = "توليت إدارة فريق.";
	const verdict = tasksVerifierSchema.parse(tasksVerifier.fakeVerdict({ ...c, gold: o }, o));
	verdict.verdicts = verdict.verdicts.map((v) => ({ ...v, verdict: "contradicted" }));
	expect(coverLetterContract.score(c, o, verdict).safetyDeterministic.pass).toBe(false);
});

it("replays the current 126 core controls offline", () => {
	const result = controls(coreCases);
	expect(result).toMatchObject({ pass: true, checked: 126, failures: [] });
});

it("records the exact hard-facts guard version without changing production", () => {
	expect(coverLetterHardFactsVersion).toBe("t006-hard-facts-v10-literal-evidence");
});
