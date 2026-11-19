import { expect, it } from "vite-plus/test";
import { buildResumeSemantics } from "./analyze/semantics";
import { buildExtractedDocument } from "./extract";
import { analyzePdfResume } from "./index";
import { makeRawExtraction } from "./test-fixtures";

const now = new Date("2026-11-19T09:00:00Z");
const rules = ["FIRST_PERSON_PRONOUNS", "WEAK_ACTION_VERBS", "NO_QUANTIFIED_IMPACT", "LONG_BULLETS"] as const;
const rawFor = (lines: string[]) => makeRawExtraction({ lines, metadata: { language: "ar-SA" } });
const semanticsFor = (lines: string[]) => {
	const raw = rawFor(lines);
	return buildResumeSemantics(raw, buildExtractedDocument(raw), { now });
};
const status = (lines: string[], code: (typeof rules)[number]) =>
	analyzePdfResume(rawFor(lines), { now }).checks.find((check) => check.code === code)?.status;

it.each(["أنا", "قمتُ", "قمت", "عملتُ", "لي", "خبرتي", "مهاراتي", "إنجازاتي"])(
	"recognizes the Arabic first-person form %s without ASCII word boundaries",
	(form) => {
		expect(
			status(
				Array.from({ length: 3 }, () => `• ${form} في تطوير الخدمات وتحليل بيانات التشغيل.`),
				"FIRST_PERSON_PRONOUNS",
			),
		).toBe("fail");
	},
);

it("does not treat ordinary Arabic words ending in ya as possessive pronouns", () => {
	const lines = Array.from({ length: 4 }, () => "• طور نظام تقارير تقني في القطاع الحكومي السعودي مع علي وليلى.");
	expect(semanticsFor(lines).firstPersonCount).toBe(0);
	expect(status(lines, "FIRST_PERSON_PRONOUNS")).toBe("pass");
});

it.each(["ساعدت", "شاركت", "كنت مسؤولًا عن", "تم إعداد"])("flags weak Arabic openings: %s", (opening) => {
	const lines = Array.from({ length: 4 }, () => `• ${opening} تقارير الجودة ومراجعة إجراءات التسليم مع الفرق.`);
	expect(status(lines, "WEAK_ACTION_VERBS")).toBe("fail");
});

it.each(["قاد", "قدت", "طوّرت", "حسّنت", "حلل", "نسق", "خفض", "وحد", "نظم", "حقق", "أطلقت"])(
	"accepts concrete Arabic actions without matching weak substrings: %s",
	(verb) => {
		expect(
			status(
				Array.from({ length: 4 }, () => `• ${verb} إجراءات تسليم تقارير الجودة بنسبة ٢٠٪.`),
				"WEAK_ACTION_VERBS",
			),
		).toBe("pass");
	},
);

it.each([
	"٢٠٪",
	"20%",
	"٢٪",
	"2%",
	"٢٠%",
	"20٪",
	"٢٠٫٥٪",
	"۲۰٪",
	"٣ فرق",
	"3 فرق",
	"ثلاثة فرق",
	"خمس فرق",
	"مئة طلب",
	"ألف طلب",
	"٢٠ بالمئة",
])("recognizes Arabic metrics: %s", (metric) => {
	expect(semanticsFor([`• طور الخدمة بمقدار ${metric} خلال دورة التسليم.`]).quantifiedBulletCount).toBe(1);
	expect(
		status(
			Array.from({ length: 4 }, () => `• طور الخدمة بمقدار ${metric} خلال دورة التسليم.`),
			"NO_QUANTIFIED_IMPACT",
		),
	).toBe("pass");
});

it.each([
	"راجع طلبات الفرق دون نتائج محددة",
	"راجع الملفات في عام ٢٠٢٤",
	"طور آلية أولية لمراجعة البيانات",
	"حلل ثلاثي الأبعاد",
])("does not invent quantified impact from Arabic prose or dates: %s", (text) => {
	expect(semanticsFor([`• ${text}`]).quantifiedBulletCount).toBe(0);
	expect(
		status(
			Array.from({ length: 4 }, () => `• ${text}`),
			"NO_QUANTIFIED_IMPACT",
		),
	).toBe("fail");
});

it.each(["•", "▪", "\uE000", "-"])("reads Arabic bullet marker %s", (marker) => {
	const lines = Array.from({ length: 4 }, () => `${marker} قاد تطوير الخدمة وخفض زمن التسليم بنسبة ٢٠٪.`);
	for (const code of rules) expect(status(lines, code)).toBe("pass");
});

it("reads Arabic bullet glyphs at the visual right edge without reversing words or digits", () => {
	const lines = Array.from({ length: 4 }, () => "قاد تطوير الخدمة وخفض زمن التسليم بنسبة ٢٠٪. •");
	for (const code of rules) expect(status(lines, code)).toBe("pass");
});

it("counts Arabic bullet words instead of character length", () => {
	const longWords = Array.from({ length: 30 }, () => "الاستراتيجيات").join(" ");
	const shortWords = Array.from({ length: 41 }, () => "تم").join(" ");
	expect(
		status(
			Array.from({ length: 4 }, () => `• طور ${longWords}`),
			"LONG_BULLETS",
		),
	).toBe("pass");
	expect(
		status(
			Array.from({ length: 4 }, () => `• ${shortWords}`),
			"LONG_BULLETS",
		),
	).toBe("fail");
});

it.each([40, 41])("keeps the Arabic long-bullet boundary at 40 words (%i)", (count) => {
	expect(
		status(
			Array.from({ length: 4 }, () => `• ${Array.from({ length: count }, () => "تسليم").join(" ")}`),
			"LONG_BULLETS",
		),
	).toBe(count === 40 ? "pass" : "fail");
});

it("does not treat تم inside an action or a project name as a weak opening", () => {
	expect(
		status(
			Array.from({ length: 4 }, () => "• قاد تمويل مشروع تطوير الخدمات وخفض وقت التسليم بنسبة ٢٠٪."),
			"WEAK_ACTION_VERBS",
		),
	).toBe("pass");
});

it("keeps English action and length heuristics for English bullets that mention Arabic text", () => {
	const lines = Array.from(
		{ length: 4 },
		() => `• Built ${"internationalization ".repeat(15)}for العربية with 40% fewer errors.`,
	);
	expect(status(lines, "WEAK_ACTION_VERBS")).toBe("pass");
	expect(status(lines, "LONG_BULLETS")).toBe("fail");
});

it("joins wrapped Arabic bullets without absorbing headings or the next role", () => {
	const continuation = Array.from({ length: 21 }, () => "التسليم").join(" ");
	const raw = makeRawExtraction({
		metadata: { language: "ar-SA" },
		lines: [
			{ text: `• طور ${continuation}`, x: 56, y: 60 },
			{ text: continuation, x: 56, y: 74 },
			{ text: "التعليم", x: 56, y: 110, size: 14 },
			{ text: continuation, x: 56, y: 138 },
			{ text: "• قاد فريق التشغيل", x: 56, y: 180 },
		],
	});
	const semantics = buildResumeSemantics(raw, buildExtractedDocument(raw), { now });
	expect(semantics.bulletLineCount).toBe(2);
	expect(semantics.longBulletCount).toBe(1);
});

it("ends an Arabic bullet at a same-size section heading", () => {
	const raw = makeRawExtraction({
		metadata: { language: "ar-SA" },
		lines: [
			{ text: `• طور ${"الخدمات ".repeat(29)}`, y: 60 },
			{ text: "التعليم", y: 74 },
			{ text: "الدراسة ".repeat(20), y: 88 },
		],
	});
	expect(buildResumeSemantics(raw, buildExtractedDocument(raw), { now }).longBulletCount).toBe(0);
});

it.each(["ar-SA", "en-US"])("uses Arabic text rather than interface language for content advice (%s)", (locale) => {
	const raw = makeRawExtraction({
		metadata: { language: null },
		lines: Array.from({ length: 4 }, () => "• قاد تطوير الخدمات وخفض زمن التسليم بنسبة ٢٠٪."),
	});
	const report = analyzePdfResume(raw, { now, locale });
	for (const code of rules) expect(report.checks.find((check) => check.code === code)?.status).toBe("pass");
});

it("keeps English content advice and other-language skips unchanged", () => {
	const lines = Array.from({ length: 4 }, () => `• I helped my team with ${"daily operations ".repeat(20)}.`);
	const english = analyzePdfResume(makeRawExtraction({ lines }), { now });
	for (const code of rules) expect(english.checks.find((check) => check.code === code)?.status).toBe("fail");
	const german = analyzePdfResume(
		makeRawExtraction({
			lines: Array.from({ length: 4 }, () => "• Mitarbeit technischer Dokumentation und Qualitätssicherung"),
			metadata: { language: "de" },
		}),
		{ now },
	);
	for (const code of rules) expect(german.checks.find((check) => check.code === code)?.skipReason).toBe("not-english");
});

it.each([
	["ar-SA", "أنا قمت بتطوير الخدمات مع فريقي."],
	["en-US", "I led my team and improved my work."],
])("locates first-person text on the correct page for %s", (locale, text) => {
	const raw = makeRawExtraction({
		pageCount: 2,
		metadata: { language: locale },
		lines: [
			{ text: "Experience", page: 1 },
			{ text, page: 2, x: 90, y: 120 },
		],
	});
	const report = analyzePdfResume(raw, { now });
	const finding = report.tips.find((item) => item.code === "FIRST_PERSON_PRONOUNS");
	expect(finding?.evidence).toMatchObject({ page: 2, snippet: text, box: { x: 90, y: 120 } });
});

it("does not highlight unrelated text in another column beside a first-person passage", () => {
	const raw = makeRawExtraction({
		metadata: { language: "en-US" },
		lines: [
			{ text: "I led my team and improved my work.", x: 40, y: 120 },
			{ text: "Education", x: 400, y: 120 },
		],
	});
	const finding = analyzePdfResume(raw, { now }).tips.find((item) => item.code === "FIRST_PERSON_PRONOUNS");
	expect(finding?.evidence?.snippet).not.toContain("Education");
	expect(finding?.evidence?.box?.x).toBe(40);
	expect(finding?.evidence?.box?.width).toBeLessThan(300);
});
