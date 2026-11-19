import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";

async function loadCatalog(locale: "ar-SA" | "en-US") {
	const filename = `${locale}.po`;
	const source = await readFile(new URL(`../../apps/web/locales/${filename}`, import.meta.url), "utf8");
	return [locale, await formatter().parse(source, { locale, sourceLocale: "en-US", filename })] as const;
}

const catalogs = Promise.all([loadCatalog("ar-SA"), loadCatalog("en-US")]);

function compiledTranslation(catalog: Awaited<ReturnType<typeof loadCatalog>>[1], id: string) {
	const translation = catalog[id]?.translation;
	if (!translation) throw new Error(`Missing translation: ${id}`);
	return compileMessageOrThrow(translation);
}

// Regressions from the contextual audit: these are the rendered meanings, not just valid PO/ICU syntax.
it.each([
	["Left", "يسار"],
	["Saving...", "جارٍ الحفظ…"],
	["Heard back", "تلقيت ردًا", "applications.insights.reply"],
	["Leads with why you fit", "يبدأ بأسباب ملاءمتك للوظيفة"],
	["Hide Link Underline", "إخفاء تسطير الروابط"],
	["Basic information", "المعلومات الأساسية"],
	["Headline", "المسمى الوظيفي"],
	["Location", "المدينة والدولة"],
	// T004 owner followups replaced generic loading text with brand motion; check progress remains localized.
	["Checking…", "جارٍ الفحص…"],
	["A CV screening systems can read", "سيرة تقرأها أنظمة الفرز", "landing.ats.title"],
	[
		"We check your PDF file itself and show what to fix. No pass score: no tool can promise one.",
		"نفحص ملف PDF نفسه ونوضّح ما يحتاج إلى إصلاح، بلا درجة نجاح، فلا توجد أداة تضمنها.",
		"landing.ats.body",
	],
] as const)("renders the intended Arabic meaning for %s", async (message, expected, context?: string) => {
	const [locale, catalog] = (await catalogs)[0];
	const id = generateMessageId(message, context);
	const entry = catalog[id];
	expect(entry, message).toBeDefined();
	expect(entry?.translation, message).toBeTruthy();
	const i18n = setupI18n({ locale, messages: { [locale]: { [id]: compiledTranslation(catalog, id) } } });
	expect(i18n._(id)).toBe(expected);
});

it("renders the current contextual password-reset email heading", async () => {
	const [locale, catalog] = (await catalogs)[0];
	const id = generateMessageId("Check your email", "auth.reset.sentTitle");
	const i18n = setupI18n({ locale, messages: { [locale]: { [id]: compiledTranslation(catalog, id) } } });
	expect(i18n._(id)).toBe("تحقق من بريدك");
});

it("preserves the minimum value in advice about overlapping lines", async () => {
	const [locale, catalog] = (await catalogs)[0];
	const id = generateMessageId("Close lines can merge when read; use spacing of at least {minimum}.");
	const i18n = setupI18n({ locale, messages: { [locale]: { [id]: compiledTranslation(catalog, id) } } });
	expect(i18n._(id, { minimum: "1.2" })).toBe("قد تندمج الأسطر المتقاربة عند القراءة؛ استخدم تباعدًا لا يقل عن 1.2.");
});

it.each([
	[
		"Press <0/> or <1/> to add or save the current keyword.",
		"اضغط <0/> أو <1/> لإضافة الكلمة المفتاحية الحالية أو حفظها.",
	],
	["Press <0/> to add or save the current keyword.", "اضغط <0/> لإضافة الكلمة المفتاحية الحالية أو حفظها."],
	["Press <0/> to open", "اضغط <0/> للفتح"],
] as const)("keeps keyboard slots in Arabic for %s", async (message, expected) => {
	const [, catalog] = (await catalogs)[0];
	const entry = catalog[generateMessageId(message)];
	expect(entry?.translation).toBe(expected);
});

it("distinguishes employment leave from leaving a dialog in Arabic without changing English", async () => {
	for (const [locale, catalog] of await catalogs) {
		const benefit = generateMessageId("Leave", "Employment benefit: time off work");
		const departure = generateMessageId("Leave");
		expect(catalog[benefit], "The benefit needs its own translation context").toBeDefined();
		const i18n = setupI18n({
			locale,
			messages: {
				[locale]: {
					[benefit]: compiledTranslation(catalog, benefit),
					[departure]: compiledTranslation(catalog, departure),
				},
			},
		});
		expect(i18n._(benefit)).toBe(locale === "ar-SA" ? "الإجازات" : "Leave");
		expect(i18n._(departure)).toBe(locale === "ar-SA" ? "مغادرة" : "Leave");
	}
});

it("keeps personal and workplace location labels distinct in Arabic", async () => {
	for (const [locale, catalog] of await catalogs) {
		const personal = generateMessageId("Location");
		const workplace = generateMessageId("Location", "workplace");
		const i18n = setupI18n({
			locale,
			messages: {
				[locale]: {
					[personal]: compiledTranslation(catalog, personal),
					[workplace]: compiledTranslation(catalog, workplace),
				},
			},
		});
		expect(i18n._(personal)).toBe(locale === "ar-SA" ? "المدينة والدولة" : "Location");
		expect(i18n._(workplace)).toBe(locale === "ar-SA" ? "مكان العمل" : "Location");
	}
});
