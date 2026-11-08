import z from "zod";

// ponytail: z.enum([...]) over 56 z.literal calls; same parse behavior, same inferred union type
export const localeSchema = z.enum([
	"af-ZA",
	"am-ET",
	"ar-SA",
	"az-AZ",
	"bg-BG",
	"bn-BD",
	"ca-ES",
	"cs-CZ",
	"da-DK",
	"de-DE",
	"el-GR",
	"en-US",
	"en-GB",
	"es-ES",
	"fa-IR",
	"fi-FI",
	"fr-FR",
	"he-IL",
	"hi-IN",
	"hu-HU",
	"id-ID",
	"it-IT",
	"ja-JP",
	"km-KH",
	"kn-IN",
	"ko-KR",
	"lt-LT",
	"lv-LV",
	"ml-IN",
	"mr-IN",
	"ms-MY",
	"ne-NP",
	"nl-NL",
	"no-NO",
	"or-IN",
	"pl-PL",
	"pt-BR",
	"pt-PT",
	"ro-RO",
	"ru-RU",
	"sk-SK",
	"sl-SI",
	"sq-AL",
	"sr-SP",
	"sv-SE",
	"ta-IN",
	"te-IN",
	"th-TH",
	"tr-TR",
	"uk-UA",
	"uz-UZ",
	"vi-VN",
	"zh-CN",
	"zh-TW",
	"zu-ZA",
]);

export type Locale = z.infer<typeof localeSchema>;

export const defaultLocale: Locale = "en-US";

/** Interface policy only. Document/native catalogs retain the full inherited locale schema. */
export const productUiLocales = ["ar-SA", "en-US"] as const;
export const uiLocaleSchema = z.enum(productUiLocales);
export type UiLocale = (typeof productUiLocales)[number];
export const defaultUiLocale: UiLocale = "ar-SA";
export function isUiLocale(value: unknown): value is UiLocale {
	return value === "ar-SA" || value === "en-US";
}
export function resolveUiLocale({
	requested,
	saved,
	cookie,
}: {
	requested?: unknown;
	saved?: unknown;
	cookie?: unknown;
}): UiLocale {
	for (const candidate of [requested, saved, cookie]) if (isUiLocale(candidate)) return candidate;
	return defaultUiLocale;
}

export function isLocale(value: unknown): value is Locale {
	return localeSchema.safeParse(value).success;
}

/**
 * A page's address in a locale: the `locale` search parameter picks the language, and the default locale's address
 * is the plain one. The server and the app both read the parameter, so each language has a URL search engines can
 * index.
 */
export type LocaleUrlPolicy = { defaultLocale: Locale; locales: readonly Locale[] };
export const productLocalePolicy: LocaleUrlPolicy = { defaultLocale: defaultUiLocale, locales: productUiLocales };
const inheritedLocalePolicy: LocaleUrlPolicy = { defaultLocale, locales: localeSchema.options };

export function localizedUrl(pageUrl: string, locale?: Locale, policy: LocaleUrlPolicy = inheritedLocalePolicy) {
	const url = new URL(pageUrl);
	if (locale && policy.locales.includes(locale) && locale !== policy.defaultLocale)
		url.searchParams.set("locale", locale);
	else url.searchParams.delete("locale");
	return url.href;
}

// Lingui's pseudo-locale (lingui.config.ts): accented, stretched English for testing layouts, not a translation.
const pseudoLocale: Locale = "zu-ZA";

/** hreflang alternates for a page: every real locale plus x-default. "sr-SP" isn't a valid region, so it's "sr". */
export function getLocaleAlternates(pageUrl: string, policy: LocaleUrlPolicy = inheritedLocalePolicy) {
	const alternates = policy.locales
		.filter((locale) => locale !== pseudoLocale)
		.map((locale) => ({ hreflang: locale === "sr-SP" ? "sr" : locale, href: localizedUrl(pageUrl, locale, policy) }));
	return [...alternates, { hreflang: "x-default", href: localizedUrl(pageUrl, policy.defaultLocale, policy) }];
}

// A writing system that needs a dedicated fallback font in the PDF renderer,
// because react-pdf (unlike a browser) has no automatic system-font fallback:
// a glyph only renders if a registered font contains it. We pick the matching
// Noto font per script so e.g. Hangul → Noto KR, Arabic → Noto Arabic, instead
// of falling back to a Latin/Han-only font and producing tofu. "emoji" is
// content-detected only (never locale-derived) and resolves to Noto Emoji so
// pictographs and regional indicators render instead of mojibake (#3321).
// "symbols" is content-detected too and resolves to Noto Sans Symbols 2 for
// text symbols such as ★ that neither Latin fonts nor Noto Emoji cover (#3581).
export type Script =
	| "hangul"
	| "kana"
	| "han-traditional"
	| "han-simplified"
	| "arabic"
	| "hebrew"
	| "thai"
	| "emoji"
	| "arrows"
	| "symbols";

// The CJK subset of `Script`. CJK needs extra per-character line breaking that
// must NOT be applied to Arabic (cursive, joined letters) or Thai (combining
// marks), so callers gate line-breaking on this rather than on `Script`.
const cjkScripts: readonly Script[] = ["hangul", "kana", "han-traditional", "han-simplified"];

export function isCjkScript(script: Script): boolean {
	return cjkScripts.includes(script);
}

// The script a locale primarily uses, used to order the fallback stack so the
// dominant language renders with its native font. Persian (fa-IR) uses the
// Arabic script.
export function getLocaleScript(locale?: Locale): Script | null {
	switch (locale) {
		case "ko-KR":
			return "hangul";
		case "ja-JP":
			return "kana";
		case "zh-TW":
			return "han-traditional";
		case "zh-CN":
			return "han-simplified";
		case "ar-SA":
		case "fa-IR":
			return "arabic";
		case "he-IL":
			return "hebrew";
		case "th-TH":
			return "thai";
		default:
			return null;
	}
}

const RTL_LANGUAGES = new Set([
	"ar", // Arabic
	"ckb", // Kurdish (Sorani)
	"dv", // Dhivehi
	"fa", // Persian
	"he", // Hebrew
	"ps", // Pashto
	"sd", // Sindhi
	"ug", // Uyghur
	"ur", // Urdu
	"yi", // Yiddish
]);

export function isRTL(locale: string): boolean {
	const language = locale.split("-")[0]?.toLowerCase() ?? "";
	return RTL_LANGUAGES.has(language);
}
