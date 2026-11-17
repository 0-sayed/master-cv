import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries } from "../canaries";
import { loadTaskFixtures } from "./fixtures";

const categories = ["translation", "cover-letter", "job-evidence", "interview-prep"];
const cases = loadTaskFixtures(
	categories.flatMap((category) =>
		["tuning", "holdout"].map((part) => new URL(`./${category}/${part}.json`, import.meta.url).pathname),
	),
);
const words = (value: unknown) => JSON.stringify(value).replace(/[\p{P}\p{Z}\s]/gu, "");

it("uses nominative meeting invitations and keeps canary closings independent of factual attacks", () => {
	for (const c of [...cases, ...loadJudgeCanaries()]) {
		expect(JSON.stringify(c), c.id).not.toContain("يسعدني لقاءكم");
		if (c.id !== "judge-canary-cover-letter-ar" && c.id !== "judge-canary-cover-letter-mixed") continue;
		const gold = c.gold as Letter;
		expect(gold.paragraphs.at(-1)?.text, c.id).toContain("يسعدني لقاؤكم");
		for (const mutant of c.mutants) {
			const letter = mutant.output as Letter;
			expect(letter.paragraphs.at(-1), `${c.id}/${mutant.id}`).toEqual(gold.paragraphs.at(-1));
		}
	}
});
type Letter = { paragraphs: { text: string; claims: { id: string; text: string; evidenceIds: string[] }[] }[] };

it("translates names inside documents separately from names of documents", () => {
	for (const c of cases.filter((c) => c.category === "translation" && c.holdout)) {
		const gold = c.gold as { direction: string; segments: { sourceId: string; text: string }[] };
		const context = gold.segments.find((segment) => segment.sourceId === "career-context-11");
		expect(context, c.id).toBeDefined();
		expect(context?.text, c.id).toContain(
			gold.direction === "ar-en" ? "names and dates in the documents" : "أسماء المستندات وتواريخها",
		);
	}
});

it("uses clear professional Arabic in letter canaries without changing factual claims", () => {
	for (const c of loadJudgeCanaries().filter((c) => c.category === "cover-letter" && c.language !== "en")) {
		const letter = c.gold as Letter;
		const text = letter.paragraphs.map((p) => p.text).join(" ");
		expect(text, c.id).not.toMatch(/ما صلة هذا العمل به|ما لي وما علي|ما قد أقدمه/);
		expect(text.split(/\s+/).length, c.id).toBeGreaterThanOrEqual(180);
		expect(text.split(/\s+/).length, c.id).toBeLessThanOrEqual(320);
		expect(letter.paragraphs.flatMap((p) => p.claims).map((claim) => claim.id)).toEqual([
			"b",
			"c",
			"experience-role-connection",
		]);
	}
});

it("closes each letter with an invitation and opens with supplied role and employer", () => {
	for (const c of cases.filter((c) => c.category === "cover-letter")) {
		const letter = c.gold as Letter;
		expect(letter.paragraphs.at(-1)?.text, c.id).toMatch(/discuss the role|لمناقشة الوظيفة/);
		for (const segment of c.jobAd?.segments ?? []) {
			if (["job-role", "job-employer"].includes(segment.id))
				expect(letter.paragraphs[0]?.text, c.id).toContain(segment.text);
		}
	}
});

it("uses genuine letter paraphrases without adding candidate claims", () => {
	for (const c of cases.filter((c) => c.category === "cover-letter" && c.holdout)) {
		const gold = c.gold as Letter;
		const honest = c.mutants.find((mutant) => mutant.expect === "honest")?.output as Letter;
		expect(words(honest), c.id).not.toBe(words(gold));
		const facts = (letter: Letter) =>
			letter.paragraphs.flatMap((p) => p.claims.map(({ id, evidenceIds }) => ({ id, evidenceIds })));
		expect(facts(honest), c.id).toEqual(facts(gold));
	}
});

it("uses meaningful job evidence paraphrases while preserving support and citations", () => {
	for (const c of cases.filter((c) => c.category === "job-evidence")) {
		const gold = c.gold as { requirements: { explanation: string; [key: string]: unknown }[] };
		for (const mutant of c.mutants.filter((mutant) => mutant.expect === "honest")) {
			const honest = mutant.output as typeof gold;
			expect(words(honest), c.id).not.toBe(words(gold));
			const citations = (output: typeof gold) =>
				output.requirements.map(({ explanation: _explanation, ...requirement }) => requirement);
			expect(citations(honest), c.id).toEqual(citations(gold));
		}
	}
});

it("keeps female career titles consistent with explicit female candidates", () => {
	const ids = [
		"translation-ar-holdout-06",
		"translation-holdout-ar-career-11",
		"translation-mixed-holdout-06",
		"translation-holdout-mixed-career-11",
		"interview-ar-h-accounting",
		"interview-ar-h-maintenance",
		"interview-mixed-h-warehousing",
		"interview-mixed-h-compliance-support",
		...["ar", "mixed"].flatMap((language) =>
			["06", "08", "10", "12"].map((suffix) => `interview-prep-holdout-${language}-career-${suffix}`),
		),
	];
	for (const id of ids) {
		const c = cases.find((c) => c.id === id);
		expect(c, id).toBeDefined();
		expect(JSON.stringify(c?.cv), id).not.toMatch(/مساعد عمليات|منسق إداري|منسق سجلات/);
	}
});
