import type { ContactEntities, ExtractedDocument, RawExtraction, TextLine } from "../types";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { normalizeSectionHeading, PDF_SECTION_HEADING_LOOKUP } from "../../ats/section-aliases";
import { columnSegments } from "../extract";
import { THRESHOLDS } from "../rules/thresholds";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/** Same shape without `g`: a stateful `lastIndex` would make `.test()` alternate between calls. */
const EMAIL_TEST = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
/** Seven to fifteen digits, the ITU range, with the separators people actually type. */
const PHONE_PATTERN =
	/(?:\+[0-9٠-٩۰-۹]{1,3}[\s.-]?)?(?:\([0-9٠-٩۰-۹]{1,4}\)[\s.-]?)?[0-9٠-٩۰-۹][0-9٠-٩۰-۹\s.()-]{5,17}[0-9٠-٩۰-۹]/g;
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const BARE_DOMAIN_PATTERN = /\b(?:[\w-]+\.)+(?:com|org|net|io|dev|me|co|ai|app|xyz|edu|gov)(?:\/[^\s<>"')\]]*)?/gi;

const PROFESSIONAL_HOSTS = ["linkedin.com", "github.com", "gitlab.com", "behance.net", "dribbble.com", "medium.com"];

/** Lines this far down page one are past where a parser expects contact details. */
const FIRST_PAGE_CONTACT_LINES = 12;
const MAX_NAME_WORDS = 5;

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function digitsIn(value: string): number {
	return (value.match(/[0-9٠-٩۰-۹]/g) ?? []).length;
}

function extractPhones(text: string): string[] {
	const candidates = text.split(/\r?\n/).flatMap((line) => line.match(PHONE_PATTERN) ?? []);

	return uniqueStrings(
		candidates
			.map((candidate) => candidate.trim())
			.filter((candidate) => {
				const digits = digitsIn(candidate);
				if (digits < 7 || digits > 15) return false;
				if (/^(?:19|20)\d{2}\s*[-–—]?\s*(?:19|20)\d{2}$/.test(normalizeNumericDigits(candidate))) return false;
				// A year range or a street number is digits too; a phone number is mostly digits.
				return digits / candidate.replace(/\s/g, "").length > 0.55;
			}),
	);
}

function hostOf(value: string): string | null {
	try {
		const url = new URL(value.startsWith("http") ? value : `https://${value}`);
		return url.hostname.replace(/^www\./, "").toLowerCase();
	} catch {
		return null;
	}
}

/** An address whose pieces are all present but interrupted: `ada @ example . com`. */
const SPACED_EMAIL = /[\w.+-]+\s*@\s*[\w-]+(?:\s*\.\s*[\w-]+)+/g;

/**
 * An email that survived layout but not extraction shows up as `name @ example.com` — every
 * character is there, but a space landed inside the address.
 *
 * Matched against a line's own text rather than a re-joined run of spans: on a two-column page one
 * line can hold a sidebar address beside an unrelated main-column sentence, and gluing those
 * together would invent an address that is not in the file.
 */
function detectSplitEmail(document: ExtractedDocument): boolean {
	return document.lines.some((line) => (line.text.match(SPACED_EMAIL) ?? []).some((candidate) => /\s/.test(candidate)));
}

/**
 * Compares each link annotation's destination against the text drawn underneath it.
 *
 * Annotation rectangles are in PDF user space (origin bottom-left) while spans have already been
 * flipped to top-left, so the rectangle is flipped here rather than un-flipping every span.
 */
function findLinkMismatches(raw: RawExtraction, document: ExtractedDocument): { shown: string; target: string }[] {
	const mismatches: { shown: string; target: string }[] = [];

	for (const link of raw.links) {
		const target = link.url ? hostOf(link.url) : null;
		if (!target) continue;

		const page = document.pages.find((candidate) => candidate.pageNumber === link.page);
		const rawPage = raw.pages.find((candidate) => candidate.pageNumber === link.page);
		if (!page || !rawPage) continue;

		const [x1, y1, x2, y2] = link.rect;
		const left = Math.min(x1, x2);
		const right = Math.max(x1, x2);
		const top = rawPage.height - Math.max(y1, y2);
		const bottom = rawPage.height - Math.min(y1, y2);

		// Spans, not lines: baseline clustering merges a whole contact row into one line, and the
		// domain half of an email address in that row would otherwise read as the link's own text.
		const covered = page.lines
			.flatMap((line) => line.spans)
			.filter((span) => span.x < right && span.x + span.width > left && span.y < bottom && span.y + span.height > top)
			.map((span) => span.text)
			.join("")
			.trim();

		if (covered.length === 0 || EMAIL_TEST.test(covered)) continue;

		const shownUrl = covered.match(URL_PATTERN)?.[0] ?? covered.match(BARE_DOMAIN_PATTERN)?.[0];
		if (!shownUrl) continue;

		const shown = hostOf(shownUrl);
		if (shown && shown !== target) mismatches.push({ shown, target });
	}

	return mismatches;
}

function looksLikeName(line: TextLine): boolean {
	const text = line.text.trim();
	if (text.length === 0 || text.length > 60) return false;
	if (EMAIL_TEST.test(text)) return false;
	if (/\d/.test(text)) return false;

	const words = text.split(/\s+/);
	if (words.length < 2 || words.length > MAX_NAME_WORDS) return false;

	// Names are letters, hyphens and apostrophes, and nothing else.
	return words.every((word) => /^[\p{L}][\p{L}'.-]*$/u.test(word));
}

export function analyzeContact(raw: RawExtraction, document: ExtractedDocument): ContactEntities {
	const text = document.fullText;

	// Reference contacts do not belong to the candidate. Track known sections independently
	// in each column so a reference heading does not hide a contact in the other column.
	const candidateLines: string[] = [];
	const referencesByColumn = new Map<number, boolean>();
	for (const page of document.pages) {
		for (const line of page.lines) {
			for (const segment of columnSegments(line)) {
				const gutter = page.gutter;
				const column =
					gutter && gutter.splitRatio >= THRESHOLDS.layout.gutterSplitRatio && segment.x >= gutter.x + gutter.width / 2
						? 1
						: 0;
				const section = PDF_SECTION_HEADING_LOOKUP.get(normalizeSectionHeading(segment.text));
				if (section) referencesByColumn.set(column, section === "references");
				if (!referencesByColumn.get(column)) candidateLines.push(segment.text);
			}
		}
	}
	const candidateText = candidateLines.join("\n");
	const emails = uniqueStrings(candidateText.match(EMAIL_PATTERN) ?? []);
	const contactLines: string[] = [];
	for (const line of (document.pages[0]?.lines ?? []).slice(0, FIRST_PAGE_CONTACT_LINES)) {
		const startsSection = columnSegments(line).some((segment) => {
			const section = PDF_SECTION_HEADING_LOOKUP.get(normalizeSectionHeading(segment.text));
			return section && section !== "profiles";
		});
		if (startsSection) break;
		contactLines.push(line.text);
	}
	const personalEmails = [
		...new Map(
			(contactLines.join("\n").match(EMAIL_PATTERN) ?? []).map((email) => [email.toLowerCase(), email]),
		).values(),
	];
	const phones = extractPhones(candidateText);

	const fullUrls = uniqueStrings(text.match(URL_PATTERN) ?? []);
	// A bare-domain hit is the same link twice when it sits inside a full URL, and not a link at
	// all when it is the domain half of an email address.
	const allEmails = uniqueStrings(text.match(EMAIL_PATTERN) ?? []);
	const bareUrls = uniqueStrings(text.match(BARE_DOMAIN_PATTERN) ?? []).filter(
		(url) => !fullUrls.some((full) => full.includes(url)) && !allEmails.some((email) => email.endsWith(`@${url}`)),
	);

	const textUrls = [...fullUrls, ...bareUrls].filter((url) => !allEmails.some((email) => url.includes(email)));

	const annotationUrls = uniqueStrings(raw.links.map((link) => link.url).filter((url): url is string => !!url));

	const firstPageLines = document.pages[0]?.lines ?? [];
	const nameLine = firstPageLines.slice(0, FIRST_PAGE_CONTACT_LINES).find(looksLikeName)?.text.trim() ?? null;

	const locationLine =
		firstPageLines
			.slice(0, FIRST_PAGE_CONTACT_LINES)
			.flatMap((line) => line.text.split(/\s*[·|•]\s*/))
			.find(
				(candidate) =>
					/^[\p{L}\p{M} .'-]+,\s*[\p{L}\p{M} .'-]+$/u.test(candidate) &&
					!candidate.endsWith(".") &&
					candidate.trim().split(/\s+/).length <= 6,
			)
			?.trim() ?? null;

	return {
		emails,
		personalEmails,
		phones,
		textUrls,
		annotationUrls,
		nameLine,
		locationLine,
		emailLooksSplit: detectSplitEmail(document),
		linkMismatches: findLinkMismatches(raw, document),
	};
}

export function hasProfessionalLink(contact: ContactEntities): boolean {
	const all = [...contact.textUrls, ...contact.annotationUrls];
	return all.some((url) => {
		const host = hostOf(url);
		return host !== null && PROFESSIONAL_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
	});
}

/** True when contact details appear only after the first page. */
export function contactIsOnFirstPage(document: ExtractedDocument, contact: ContactEntities): boolean {
	if (contact.emails.length === 0 && contact.phones.length === 0) return false;

	const firstPageText = (document.pages[0]?.lines ?? []).map((line) => line.text).join("\n");

	return (
		contact.emails.some((email) => firstPageText.includes(email)) ||
		contact.phones.some((phone) => firstPageText.includes(phone))
	);
}
