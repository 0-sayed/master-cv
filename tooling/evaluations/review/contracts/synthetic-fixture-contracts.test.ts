import { expect, it } from "vite-plus/test";
import { loadJudgeCanaries } from "../canaries";
import { fixtureHash, studyReviewItems, loadStudyCases } from "../study";
import { loadTaskFixtures } from "./fixtures";
import { getTaskContract } from "./index";

const categories = ["job-evidence", "translation", "cover-letter", "interview-prep"] as const;
const fixtures = loadTaskFixtures(
	categories.flatMap((category) =>
		["tuning", "holdout"].map((part) => new URL(`./${category}/${part}.json`, import.meta.url).pathname),
	),
);
const cases = [
	...fixtures,
	...loadJudgeCanaries().filter((c) => categories.some((category) => c.category === category)),
];
const find = (id: string) => {
	const c = cases.find((c) => c.id === id);
	if (!c) throw new Error(`MISSING_FIXTURE:${id}`);
	return c;
};

it("exports fixture-bound synthetic author declarations and binds them to approval hashes", () => {
	const items = studyReviewItems("tasks-v1", loadStudyCases("tasks-v1"));
	for (const c of cases) {
		const item = items.find((item) => item.id === c.id);
		expect(item).toHaveProperty("provenance.synthetic", true);
		expect(item).toHaveProperty("provenance.authoredBy", "codex lane");
		expect(item).toHaveProperty(
			"provenance.declaration",
			"جميع الأشخاص والجهات في هذه الحالة مختلقة، ولا تستند بياناتها إلى أشخاص أو جهات حقيقية. All people and organisations in this case are fictional.",
		);
		if (!item) throw new Error("MISSING_REVIEW_ITEM");
		const changed = { ...item, provenance: null };
		expect(fixtureHash(changed)).not.toBe(fixtureHash(item));
	}
});

it("separates supported work from unsupported modelling or accuracy and preserves stated priorities", () => {
	for (const language of ["ar", "en", "mixed"]) {
		for (const suffix of ["h2", "h3"]) {
			const c = find(`je-${language}-${suffix}`);
			const schema = getTaskContract("job-evidence").outputSchema;
			const gold = schema.parse(c.gold) as {
				requirements: { spanIds: string[]; verdict: string; importance: string }[];
			};
			expect(c.jobAd?.segments).toHaveLength(suffix === "h2" ? 3 : 4);
			expect(gold.requirements).toHaveLength(3);
			expect(gold.requirements.slice(0, 2).map((r) => r.verdict)).toEqual(["supported", "no_evidence"]);
			expect(gold.requirements.slice(0, 2).map((r) => r.importance)).toEqual(
				Array(2).fill(suffix === "h2" || language === "ar" ? "essential" : "unstated"),
			);
			expect(gold.requirements[0]?.spanIds).not.toEqual(gold.requirements[1]?.spanIds);
		}
	}
	const c = find("je-mixed-t3");
	for (const output of [c.gold, ...c.mutants.map((m) => m.output)])
		expect(output).toHaveProperty("requirements.1.importance", "essential");
});

it("uses the Arabic Excel glossary in all corrected translation outputs while retaining English sources", () => {
	for (const id of [
		"translation-en-tuning-01",
		"translation-en-holdout-08",
		"translation-mixed-holdout-08",
		"judge-canary-translation-en",
	]) {
		const c = find(id);
		expect(JSON.stringify(c.cv)).toContain("Excel");
		for (const output of [c.gold, ...c.mutants.map((m) => m.output)]) {
			expect(JSON.stringify(output)).not.toContain("Excel");
		}
	}
});

it("keeps concise Arabic courtesy and complete factual paraphrases in all letter controls", () => {
	for (const c of cases.filter((c) => c.category === "cover-letter" && c.language !== "en")) {
		for (const output of [c.gold, ...c.mutants.map((m) => m.output)]) {
			expect(JSON.stringify(output)).toContain("شكرًا لكم على ما بذلتم من وقت للنظر في طلبي");
			expect(JSON.stringify(output)).not.toContain("النظر إلى هذا الطلب");
		}
	}
	for (const id of ["letter-holdout-ar-08", "letter-holdout-mixed-08"]) {
		const output = find(id).mutants.find((m) => m.id === "honest-factual-paraphrase")?.output;
		expect(JSON.stringify(output)).toContain("راجعت مدى اكتمال السجلات.");
		expect(JSON.stringify(output)).not.toContain("تحققت من اكتمال السجلات");
	}
});

it("keeps both letter facts and the cited Astra connection in the opening, including canaries", () => {
	for (const c of cases.filter((c) => c.category === "cover-letter")) {
		for (const output of [c.gold, ...c.mutants.map((m) => m.output)]) {
			const letter = output as {
				paragraphs: {
					text: string;
					claims: { id: string; text: string; evidenceIds: string[]; jobSpanIds?: string[] }[];
				}[];
			};
			const opening = letter.paragraphs[0];
			expect(opening).toBeDefined();
			const bridge = opening?.claims.find((claim) => claim.id === "experience-role-connection");
			expect(bridge).toMatchObject({ evidenceIds: ["cv-1", "cv-2"], jobSpanIds: ["job-duty"] });
			expect(bridge?.text).toBe(
				c.language === "en"
					? "This experience relates to the record organisation and request follow-up duties described in your posting."
					: "وترتبط هذه الخبرة بمهام تنظيم السجلات ومتابعة الطلبات الواردة في إعلانكم.",
			);
			const factIds = c.language === "en" ? ["experience-1", "experience-2"] : ["b", "c"];
			for (const id of factIds) {
				const claim = opening?.claims.find((claim) => claim.id === id);
				expect(claim).toBeDefined();
				expect(opening?.text).toContain(claim?.text);
				expect(opening?.text.indexOf(claim?.text ?? "")).toBeLessThan(opening?.text.indexOf(bridge?.text ?? "") ?? -1);
			}
		}
	}
});

it("keeps feminine agreement in sources, premises, honest questions and intentionally false leadership claims", () => {
	for (const id of [
		"interview-ar-t-administration",
		"interview-ar-t-customer-service",
		"interview-mixed-t-healthcare-administration",
		"interview-mixed-t-technical-support",
		"interview-ar-h-accounting",
		"interview-ar-h-maintenance",
		"interview-mixed-h-warehousing",
		"interview-mixed-h-compliance-support",
		"judge-canary-interview-prep-ar",
		"judge-canary-interview-prep-mixed",
	]) {
		const c = find(id);
		expect(JSON.stringify(c.cv)).toContain("لم تتولَّ إدارة فريق.");
		expect(JSON.stringify(c)).not.toContain("لم يتول إدارة فريق");
		expect(JSON.stringify(c)).not.toContain("ستتبعها");
		const escalation = c.mutants.find((m) => m.id === "escalation-premise");
		if (escalation) expect(JSON.stringify(escalation.output)).toContain("تولّت إدارة فريق.");
	}
	const ghada = find("interview-mixed-t-technical-support");
	for (const output of [ghada.gold, ...ghada.mutants.map((m) => m.output)])
		expect(JSON.stringify(output)).toContain("ما المعلومات التي ستطلبينها لإعادة إنتاج العطل؟");
});
