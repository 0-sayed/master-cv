import { describe, expect, it } from "vite-plus/test";
import examples from "./guard-recorded-examples.json";
import { assertHardFacts } from "./hard-facts";
import { boundedEvidenceAbsence, assessmentText, guardTaskClaims } from "./variant-guard";
import { validateVariantOutput } from "./variant-validation";

const policy = { lostFact: false, subsetEntities: true };
it("accepts a scoped Arabic relevance bridge while rejecting an invented experience inside it", () => {
	const context = {
		category: "cover-letter",
		cv: [{ id: "cv-1", section: "experience", text: "رتبت ملفات الموردين." }],
		jobAd: { segments: [{ id: "job-duty", text: "تنظيم السجلات ومتابعة الطلبات" }] },
	};
	const claim = {
		id: "bridge",
		kind: "fact" as const,
		evidenceIds: ["cv-1"],
		jobSpanIds: ["job-duty"],
		text: "هذا يرتبط بمهام تنظيم السجلات ومتابعة الطلبات المذكورة في إعلانكم.",
	};
	expect(guardTaskClaims(context, [claim], policy).pass).toBe(true);
	expect(
		guardTaskClaims(
			context,
			[{ ...claim, text: "هذا يرتبط بمهام تنظيم السجلات ومتابعة الطلبات التي قدتها المذكورة في إعلانكم." }],
			policy,
		).pass,
	).toBe(false);
	expect(
		guardTaskClaims(context, [{ ...claim, text: "هذا يرتبط بمهام إدارة الميزانية المذكورة في إعلانكم." }], policy).pass,
	).toBe(false);
});
it("keeps a named organization code separate from a claimed work quantity", () => {
	const evidence =
		"عملت من 2012 إلى 2015 مساعد عمليات في مؤسسة سجل T 3 الافتراضية بمدينة الدمام، وتوليت ترتيب ملفات الموردين ومراجعة بيانات الطلبات اليومية.";
	const after =
		"عملت مساعد عمليات في مؤسسة سجل T 3 الافتراضية بالدمام من 2012 إلى 2015، حيث رتبت ملفات الموردين وراجعت بيانات الطلبات اليومية.";
	expect(() => assertHardFacts("", after, evidence)).not.toThrow();
	expect(() => assertHardFacts("", after.replace("T 3", "R 3"), evidence)).toThrow("AI_UNSUPPORTED_CLAIM");
	expect(() => assertHardFacts("", "أعددت 3 تقارير في الدمام.", evidence)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it("deduplicates an action without borrowing a stemmed employer name", () => {
	const source =
		"Recorded service requests and recorded service requests. Worked at Brindle Trial Services during 2024.";
	expect(() =>
		assertHardFacts(source, "Recorded service requests. Worked at Brindle Trial Services during 2024.", source),
	).not.toThrow();
	expect(() =>
		assertHardFacts(source, "Recorded service requests. Worked at Orchard Trial Services during 2024.", source),
	).toThrow("AI_UNSUPPORTED_CLAIM");
});
it("does not borrow coordinator from another role to upgrade an operations assistant", () => {
	const source = "Operations assistant from 2014 to 2017. Administrative coordinator from 2017 to 2020.";
	expect(() => assertHardFacts("", "Operations assistant.", source)).not.toThrow();
	expect(() => assertHardFacts("", "Operations coordinator.", source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it.each([
	[
		"كتب اختبارات باستخدام Node.js.\nوثق نتائج الاختبارات.",
		"كتب اختبارات باستخدام Node.js.",
		"وثق نتائج الاختبارات باستخدام Node.js.",
	],
	[
		"Prepared weekly reports using Excel.\nPrepared monthly summaries.",
		"Prepared weekly reports using Excel.",
		"Prepared monthly summaries using Excel.",
	],
])("binds a tool to its supplied activity: %s", (source, honest, invented) => {
	expect(() => assertHardFacts("", honest, source)).not.toThrow();
	expect(() => assertHardFacts("", invented, source)).toThrow("AI_UNSUPPORTED_CLAIM");
});

it("translates a degree level without upgrading it", () => {
	const source = "Bachelor of Supply Chain Management.";
	expect(() => assertHardFacts("", "بكالوريوس في إدارة سلسلة الإمداد.", source)).not.toThrow();
	expect(() => assertHardFacts("", "ماجستير في إدارة سلسلة الإمداد.", source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
it("keeps a dotted tool name within its sentence when an action is reordered", () => {
	const source = "اختبر واجهات البرمجة باستخدام Node.js.";
	expect(() => assertHardFacts(source, "اختبر باستخدام Node.js واجهات البرمجة.", source)).not.toThrow();
	expect(() => assertHardFacts(source, "اختبر باستخدام Python واجهات البرمجة.", source)).toThrow(
		"AI_UNSUPPORTED_CLAIM",
	);
});

it("distinguishes a management activity from a feminine management verb", () => {
	const source = "مساعدة عمليات في شركة النور. ساعدت الفريق في إدارة السجلات.";
	expect(() => assertHardFacts("", "ساعدت الفريق في إدارة السجلات.", source)).not.toThrow();
	expect(() => assertHardFacts("", "أدارت الفريق في إدارة السجلات.", source)).toThrow("AI_UNSUPPORTED_CLAIM");
	expect(() => assertHardFacts("", "أدارتهم في إدارة السجلات.", source)).toThrow("AI_UNSUPPORTED_CLAIM");
});

it("keeps unprovided report facts rejected even when a date claim is honest", () => {
	const source = "استخدمت وورد وإكسل في إعداد الجداول والمراسلات الداخلية.";
	expect(() => assertHardFacts("", "أعددت الجداول والمراسلات الداخلية.", source)).not.toThrow();
	expect(() => assertHardFacts("", "أعددت التقارير الأسبوعية.", source)).toThrow("AI_UNSUPPORTED_CLAIM");
});
describe("recorded factual paraphrases", () => {
	it.each(examples)("accepts $category: $text", (example) => {
		const result = guardTaskClaims(
			{ ...example, jobAd: "jobAd" in example ? (example.jobAd ?? null) : null },
			[{ id: "claim", text: example.text, evidenceIds: example.evidenceIds, kind: "fact" }],
			policy,
		);
		expect(result, JSON.stringify(result)).toMatchObject({ pass: true });
	});
	it.each(examples)("rejects invented metrics beside $category paraphrases", (example) => {
		const result = guardTaskClaims(
			{ ...example, jobAd: "jobAd" in example ? (example.jobAd ?? null) : null },
			[
				{
					id: "claim",
					text: `${example.text} I improved accuracy by 95%.`,
					evidenceIds: example.evidenceIds,
					kind: "fact",
				},
			],
			policy,
		);
		expect(result.pass).toBe(false);
	});
});

it.each([
	["The CV states SAP was not used.", true],
	["The supplied CV does not document SAP experience.", true],
	["No supporting evidence was found in this CV.", true],
	["No matching evidence was found in the supplied CV.", true],
	["No relevant evidence was found in this resume.", true],
	["No supporting evidence exists anywhere.", false],
	["No supporting evidence was found in this CV, so the candidate lacks SAP skills.", false],
	["تذكر السيرة أن SAP لم يُستخدم في العمل.", true],
	["SAP is not documented in the CV.", true],
	["The candidate cannot use SAP.", false],
	["The CV shows that the candidate cannot use SAP.", false],
	["This CV demonstrates SAP expertise.", false],
])("bounds absence to the document: %s", (text, expected) => {
	expect(boundedEvidenceAbsence(text)).toBe(expected);
});

it("production job evidence accepts documented non-use without asserting inability", () => {
	const snapshot = {
		category: "job-evidence" as const,
		resumeId: "cv",
		sourceRevision: "r1",
		cv: [{ id: "fact", section: "experience", text: "Did not use SAP at work." }],
		jobAd: { segments: [{ id: "job", text: "SAP experience." }] },
	};
	const output = {
		requirements: [
			{
				id: "sap",
				spanIds: ["job"],
				importance: "unstated",
				verdict: "no_evidence",
				evidenceIds: ["fact"],
				explanation: "The CV states SAP was not used.",
			},
		],
		notes: [],
	};
	expect(() => validateVariantOutput(snapshot, output)).not.toThrow();
	expect(() =>
		validateVariantOutput(snapshot, {
			...output,
			requirements: [{ ...output.requirements[0], explanation: "The candidate cannot use SAP." }],
		}),
	).toThrow("JOB_UNBOUNDED_ABSENCE");
});

it("distinguishes a denial of a hiring prediction from an actual prediction", () => {
	expect(assessmentText("أسئلة تدريبية فقط؛ لا تتضمن تقديرًا لاحتمال التوظيف أو نتيجة توظيفية.")).not.toMatch(
		/احتمال التوظيف/u,
	);
	expect(assessmentText("احتمال التوظيف 95%.")).toContain("احتمال التوظيف");
	expect(assessmentText("لا تتضمن تقديرًا لاحتمال التوظيف؛ احتمال التوظيف 95%.")).toContain("احتمال التوظيف");
});

it.each([
	[4, "2020", "2019"],
	[5, "administrative coordinator", "administrative manager"],
	[0, "without changing", "by changing"],
	[1, "المعتمدة", "المعتمدة دوليًا"],
	[2, "Bachelor", "Master"],
	[6, "Riwaq Coordination", "Invented Employer"],
	[12, "مؤسسة افتراضية", "مؤسسة جديدة"],
])("rejects changed dates, roles, polarity, credentials and identities: %s", (index, honest, invented) => {
	const example = examples[index];
	if (!example) throw new Error("Missing recorded regression example");
	expect(example.text).toContain(honest);
	const result = guardTaskClaims(
		{ ...example, jobAd: "jobAd" in example ? (example.jobAd ?? null) : null },
		[{ id: "claim", text: example.text.replace(honest, invented), evidenceIds: example.evidenceIds, kind: "fact" }],
		policy,
	);
	expect(result.pass).toBe(false);
});
