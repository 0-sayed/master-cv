import _slugify from "@sindresorhus/slugify";
import { adjectives, animals, colors, uniqueNamesGenerator } from "unique-names-generator";
import { v7 as uuidv7 } from "uuid";

/**
 * Generates a unique ID using the UUIDv7 algorithm.
 * @returns The generated ID.
 */
export function generateId() {
	return uuidv7();
}

/** Slugifies a string, with some pre-defined options.
 *
 * @param value - The value to slugify.
 * @returns The slugified value.
 */
export function slugify(value: string) {
	const slug = _slugify(value, { decamelize: false });
	if (slug || !value.trim()) return slug;
	return slugify(generateRandomName());
}

/**
 * Generates initials from a name.
 * @param name - The name to generate initials from.
 * @returns The initials.
 */
export function getInitials(name: string) {
	const words = name.trim().split(/\s+/u).filter(Boolean);
	if (!words.length) return "";
	const first = words[0]?.charAt(0) ?? "";
	if (words.length === 1) return first.toUpperCase();
	const last = words[words.length - 1]?.replace(/^ال(?=\p{Script=Arabic})/u, "").charAt(0) ?? "";
	return [first, last].join(/\p{Script=Arabic}/u.test(first + last) ? " " : "").toUpperCase();
}

/**
 * Transforms a string to a valid username (lowercase, no special characters except for dots, hyphens and underscores).
 * @param value - The value to transform.
 * @returns The transformed username.
 */
export function toUsername(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]/g, "")
		.slice(0, 64);
}

/**
 * Generates a random name using the unique-names-generator library.
 * @returns The random name.
 */
export function generateRandomName() {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, colors, animals],
		style: "capital",
		separator: " ",
		length: 3,
	});
}

/**
 * Strips HTML tags from a string and returns the text content.
 * @param html - The HTML string to strip.
 * @returns The text content without HTML tags.
 */
/** Text safe to place inside HTML: markup characters and both quote marks become entities. */
export const escapeHtml = (text: string) =>
	text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
/** Decode one level of HTML text entities, without interpreting markup. */
export const decodeHtmlEntities = (text: string) =>
	text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
		if (name.startsWith("#x") || name.startsWith("#X")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
		if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
		return HTML_ENTITIES[name.toLowerCase()] ?? entity;
	});

export function stripHtml(html: string | undefined): string {
	if (!html) return "";
	return html.replace(/<[^>]*>/g, "").trim();
}

/** Numeric alphabet conversion only; callers retain the original source as evidence. */
export function normalizeNumericDigits(value: string): string {
	return value.replace(/[٠-٩۰-۹]/gu, (character) =>
		String(character.charCodeAt(0) - (character <= "٩" ? 0x660 : 0x6f0)),
	);
}

/** Decode shaped Arabic glyph forms at an extraction boundary; retain raw reader text separately. */
export function normalizeArabicPresentationForms(value: string): string {
	return value.replace(/[\uFB50-\uFDFF\uFE70-\uFEFF]/gu, (glyph) => glyph.normalize("NFKC"));
}

/** D33 display/import boundary only; never apply to manually saved resume content. */
export function removeArabicDiacritics(value: string): string {
	return value.replace(/[\u064B-\u0652\u0670]/gu, "");
}
