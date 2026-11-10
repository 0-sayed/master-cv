import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { arabicCopyViolations } from "./arabic-copy";

it("rejects finite action verbs and obsolete glossary terms without rejecting prose or valid verbal nouns", () => {
	for (const [message, translation] of [
		["Share", "يشارك"],
		["Ignore", "يتجاهل"],
		["Show", "تعرض"],
		["Document", "وثيقة"],
		["Cover letter", "خطاب تغطية"],
		["Tag", "علامة"],
		["Provider", "مقدّم خدمات"],
		["Applications", "الطلبات"],
		["Short and polite, for the recruiter", "قصير ومهذب، للمجند"],
	])
		expect(arabicCopyViolations({ test: { message, translation } })).toHaveLength(1);
	for (const [message, translation] of [
		["Change", "تغيير"],
		["Export", "تصدير"],
		["Sign in", "تسجيل الدخول"],
		["Share", "مشاركة"],
		["Sends your resume", "يرسل سيرتك الذاتية"],
		["Documentation", "وثائق تقنية"],
		["HTML tag", "علامة HTML"],
		["I agree", "أوافق"],
	])
		expect(arabicCopyViolations({ test: { message, translation } })).toEqual([]);
});

it("keeps the Arabic catalog on the owner-approved action and terminology contract", async () => {
	const source = await readFile(new URL("../../apps/web/locales/ar-SA.po", import.meta.url), "utf8");
	const catalog = await formatter().parse(source, { locale: "ar-SA", sourceLocale: "en-US", filename: "ar-SA.po" });
	expect(arabicCopyViolations(catalog)).toEqual([]);
	for (const entry of Object.values(catalog)) expect(entry.translation).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/u);
});

it("keeps the copy deck on the same terminology contract and records the approved glossary", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as {
		entries: Array<{ key: string; messages: Record<string, string> }>;
		glossary: Array<{ "ar-SA": string; "en-US": string }>;
	};
	expect(
		arabicCopyViolations(
			Object.fromEntries(
				deck.entries.map((entry) => [
					entry.key,
					{
						message: entry.messages["en-US"],
						translation: entry.messages["ar-SA"],
					},
				]),
			),
		),
	).toEqual([]);
	for (const [english, arabic] of [
		["CV", "سيرة ذاتية"],
		["Cover letter", "خطاب تقديم"],
		["Document", "مستند"],
		["Job application", "طلب تقديم"],
		["Job posting", "إعلان وظيفة"],
		["Job title", "مسمى وظيفي"],
		["Professional summary", "ملخص مهني"],
		["Draft", "مسودة"],
		["tailored copy", "نسخة مخصصة"],
		["version history", "سجل النسخ"],
		["Recruiter", "مسؤول توظيف"],
		["Tag", "وسم"],
		["Career fact", "معلومة مهنية"],
		["Provider", "مزوّد"],
		["Theme", "المظهر"],
		["Upload", "رفع"],
		["Download", "تنزيل"],
		["Share", "مشاركة"],
		["Save", "حفظ"],
	])
		expect(deck.glossary.find((entry) => entry["en-US"] === english)?.["ar-SA"], english).toBe(arabic);
});
