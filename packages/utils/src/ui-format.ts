import type { UiLocale } from "./locale";
import { normalizeNumericDigits } from "./string";
export function formatUiNumber(value: number, locale: UiLocale, options: Intl.NumberFormatOptions): string {
	return new Intl.NumberFormat(locale, { ...options, numberingSystem: "latn" }).format(value);
}
/** Application instants only. CV dates can be partial, Hijri or free text and must never enter this API. */
export function formatUiTimestamp(value: Date, locale: UiLocale, options: Intl.DateTimeFormatOptions): string {
	return new Intl.DateTimeFormat(locale, {
		...options,
		calendar: "gregory",
		numberingSystem: "latn",
		timeZone: "Asia/Riyadh",
	}).format(value);
}
export function normalizeSearchText(value: string): string {
	return normalizeNumericDigits(value.normalize("NFC")).replace(
		/[\u0610-\u061A\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/gu,
		"",
	);
}
