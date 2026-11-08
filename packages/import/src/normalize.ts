import {
	normalizeArabicPresentationForms,
	normalizeNumericDigits,
	removeArabicDiacritics,
} from "@reactive-resume/utils/string";

/** Normalize extracted document text before parsing; raw files and saved JSON stay unchanged. */
export function normalizeImportedText(value: string): string {
	return removeArabicDiacritics(normalizeNumericDigits(normalizeArabicPresentationForms(value)));
}
