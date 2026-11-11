import type { ResumeData } from "./data";

/** D37: tested document faces, independent of interface language. */
export const FONT_PAIRINGS = [
	{ id: "classic", label: "Classic", heading: "EB Garamond", body: "EB Garamond", headingWeight: "600" },
	{ id: "traditional", label: "Traditional", heading: "Tinos", body: "Tinos", headingWeight: "700" },
	{ id: "balanced", label: "Balanced", heading: "Source Serif 4", body: "Source Sans 3", headingWeight: "600" },
	{ id: "professional", label: "Professional", heading: "Carlito", body: "Carlito", headingWeight: "700" },
	{ id: "clean", label: "Clean", heading: "Lato", body: "Lato", headingWeight: "700" },
] as const;
export const ARABIC_FONT_PAIRINGS = [
	{
		id: "arabic-plex",
		label: "IBM Plex Sans Arabic",
		heading: "IBM Plex Sans Arabic",
		body: "IBM Plex Sans Arabic",
		headingWeight: "700",
	},
	{ id: "arabic-cairo", label: "Cairo", heading: "Cairo", body: "Cairo", headingWeight: "700" },
] as const;
export const DOCUMENT_FONT_PAIRINGS = [...FONT_PAIRINGS, ...ARABIC_FONT_PAIRINGS];

function contentText(value: unknown): string {
	if (typeof value === "string") return value.replace(/<[^>]*>/g, "");
	if (!value || typeof value !== "object") return "";
	if ("hidden" in value && value.hidden === true) return "";
	return Object.values(value).map(contentText).join(" ");
}

export function getDocumentFontChoices(data: ResumeData) {
	const text = contentText([data.basics, data.summary, data.sections, data.customSections]);
	// No tested primary face covers other scripts. Keep stored fonts and existing PDF fallbacks.
	const unsupported = [...text].some((c) => /\p{Letter}/u.test(c) && !/[\p{Script=Latin}\p{Script=Arabic}]/u.test(c));
	const arabic = data.metadata.page.locale.startsWith("ar") || /\p{Script=Arabic}/u.test(text);
	const pairings = unsupported ? [] : arabic ? [...ARABIC_FONT_PAIRINGS] : [...FONT_PAIRINGS];
	const families: string[] = [...new Set(pairings.flatMap((p) => [p.heading, p.body]))];
	return { pairings, families };
}

export function getDefaultFontPairing(locale: string) {
	return locale.startsWith("ar") ? ARABIC_FONT_PAIRINGS[0] : FONT_PAIRINGS[3];
}

export function getRecommendedFontPairing(data: ResumeData) {
	const { families, pairings } = getDocumentFontChoices(data);
	if (
		[data.metadata.typography.heading, data.metadata.typography.body].every((face) =>
			families.includes(face.fontFamily),
		)
	)
		return null;
	return pairings.find((p) => p.id === getDefaultFontPairing(data.metadata.page.locale).id) ?? pairings[0] ?? null;
}
