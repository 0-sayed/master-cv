import type { DateToken, ExtractedDocument } from "../types";
import {
	isFutureEndpoint,
	isReversedPeriod,
	parsePeriod,
	parseSingleDate,
	ONGOING_TOKENS_BY_LANGUAGE,
} from "@reactive-resume/schema/resume/period";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { columnSegments, hasIndependentColumns } from "../extract";
import { THRESHOLDS } from "../rules/thresholds";
import { detectHeadings, normalizeHeading } from "./sections";

const MONTH_WORD = String.raw`[\p{L}\p{M}]{3,12}\.?`;
const ENDPOINT = String.raw`(?:${MONTH_WORD}\s*'?\d{2,4}|\d{4}-\d{2}(?:-\d{2})?|\d{1,2}[/.\-]\d{2,4}|\d{4})`;
const ARABIC_ONGOING = (ONGOING_TOKENS_BY_LANGUAGE.ar ?? [])
	.map((token) => token.split(/\s+/u).join(String.raw`\s+`))
	.join("|");
const ONGOING = String.raw`(?:present|current|currently|now|ongoing|to\s?date|today|${ARABIC_ONGOING})`;
const SEPARATOR = String.raw`\s*(?:[-–—~]|to|through|until)\s*`;

const RANGE_PATTERN = new RegExp(
	`(?<![\\p{L}\\p{N}])(?=(${ENDPOINT}${SEPARATOR}(?:${ENDPOINT}|${ONGOING}))(?!\\d))`,
	"giu",
);
const SINGLE_PATTERN = new RegExp(String.raw`(?:${MONTH_WORD}\s+\d{4}|\d{1,2}/\d{4})\b`, "giu");

/** A numeric date whose first two components could each be a month or a day. */
const AMBIGUOUS_NUMERIC_PATTERN = /\b(0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](\d{2}|\d{4})\b/g;

/**
 * `[A-Za-z]{3,9}` in the range pattern will happily match "Framework 2021 - 2023", which is a
 * product name next to two years, not a period. Every alphabetic run in a candidate therefore has
 * to be a month name or an ongoing marker in this locale before it counts as a date at all.
 *
 * The trade-off is deliberate: a misspelled month is dropped rather than reported unparseable.
 * Claiming a date is malformed when it is not a date is the worse error.
 */
function looksLikeDateWords(raw: string, locale: string): boolean {
	const words = raw.match(/[\p{L}\p{M}]+/gu) ?? [];

	return words.every((word) => {
		const lower = word.toLowerCase();
		if (ONGOING_WORDS.has(lower)) return true;
		return parseSingleDate(`${word} 2000`, locale) !== null;
	});
}

const ONGOING_WORDS = new Set([
	...(ONGOING_TOKENS_BY_LANGUAGE.ar ?? []).flatMap((token) => token.split(/\s+/)),
	"present",
	"current",
	"currently",
	"now",
	"ongoing",
	"today",
	"date",
	"to",
	"through",
	"until",
]);

function shapeOf(raw: string): DateToken["shape"] {
	const dated = raw.replace(new RegExp(ONGOING, "giu"), "");
	if (/\p{L}/u.test(dated)) return "mon-year";
	if (/\d{4}-\d{2}(?!\d)|(?<!\d)\d{1,2}[/.-]\d{2,4}/u.test(normalizeNumericDigits(dated))) return "numeric";
	return "year";
}

function toToken(
	raw: string,
	kind: DateToken["kind"],
	page: number,
	lineIndex: number,
	locale: string,
	now: Date,
): DateToken {
	const base = { raw, page, lineIndex, kind, shape: shapeOf(raw) } as const;

	if (kind === "single") {
		const parsed = parseSingleDate(raw, locale);
		return {
			...base,
			parsed: parsed !== null,
			ongoing: false,
			startYear: parsed?.year ?? null,
			endYear: parsed?.year ?? null,
			reversed: false,
			future: parsed ? isFutureEndpoint(parsed, now) : false,
		};
	}

	const parsed = parsePeriod(raw, locale);
	if (!parsed) {
		return { ...base, parsed: false, ongoing: false, startYear: null, endYear: null, reversed: false, future: false };
	}

	const reversed = !!parsed.start && !!parsed.end && isReversedPeriod(parsed.start, parsed.end);
	const future =
		(!!parsed.start && isFutureEndpoint(parsed.start, now)) || (!!parsed.end && isFutureEndpoint(parsed.end, now));

	return {
		...base,
		parsed: true,
		ongoing: parsed.ongoing,
		startYear: parsed.start?.year ?? null,
		endYear: parsed.end?.year ?? null,
		reversed,
		future,
	};
}

export type DateAnalysis = {
	tokens: DateToken[];
	unparseableRanges: string[];
	ambiguousNumericDates: string[];
	/** Gaps of more than a year between one role ending and the next beginning. */
	gaps: { from: number; to: number; before: DateToken; after: DateToken }[];
};

/**
 * Reads every date on the page, using the same period grammar the builder's live lint uses so a
 * resume never passes one check and fails the other on the same string.
 */
export function analyzeDates(document: ExtractedDocument, locale: string, now: Date): DateAnalysis {
	const tokens: DateToken[] = [];
	const unparseableRanges: string[] = [];
	const ambiguousNumericDates: string[] = [];
	const experienceTokens: DateToken[] = [];
	const sections = new Map<number, string>();
	const headings = detectHeadings(document);
	// A section grid shares one heading across both columns. Sidebars have headings on both sides.
	const independentSections = document.pages.some((page) => {
		const gutter = page.gutter;
		if (!gutter || !hasIndependentColumns(page) || gutter.splitRatio < THRESHOLDS.layout.gutterSplitRatio) return false;
		const columns = new Set(
			headings
				.filter((heading) => heading.page === page.pageNumber && heading.sectionType)
				.map((heading) => (heading.x >= gutter.x + gutter.width / 2 ? 1 : 0)),
		);
		return columns.size === 2;
	});

	document.lines.forEach((fullLine, lineIndex) => {
		const page = document.pages.find((item) => item.pageNumber === fullLine.page);
		const columnOf = (x: number) =>
			independentSections &&
			page?.gutter &&
			hasIndependentColumns(page) &&
			page.gutter.splitRatio >= THRESHOLDS.layout.gutterSplitRatio &&
			x >= page.gutter.x + page.gutter.width / 2
				? 1
				: 0;
		for (const heading of headings.filter((item) => item.lineIndex === lineIndex && item.sectionType)) {
			if (heading.sectionType) sections.set(columnOf(heading.x), heading.sectionType);
		}
		for (const line of columnSegments(fullLine)) {
			const column = columnOf(line.x);
			const heading = normalizeHeading(line.text);
			const section =
				/^(?:courses|training|الدورات|دورات|التدريب)$/u.test(heading) && !/[.!?;,]$/.test(line.text.trim())
					? "certifications"
					: undefined;
			if (section) sections.set(column, section);
			// Digit conversion is length preserving; candidate offsets still point into the raw evidence.
			const numeric = normalizeNumericDigits(line.text);
			const ranges: string[] = [];
			let rangeEnd = 0;
			// Overlapping candidates let a rejected non-month word expose the numeric range after it.
			for (const match of numeric.matchAll(RANGE_PATTERN)) {
				if (match.index < rangeEnd || !match[1]) continue;
				const raw = line.text.slice(match.index, match.index + match[1].length);
				if (!looksLikeDateWords(raw, locale)) continue;
				ranges.push(raw);
				rangeEnd = match.index + raw.length;
			}
			for (const raw of ranges) {
				const token = toToken(raw.trim(), "range", line.page, lineIndex, locale, now);
				token.segmentX = line.x;
				tokens.push(token);
				if (sections.get(column) === "experience") experienceTokens.push(token);
				if (!token.parsed) unparseableRanges.push(token.raw);
			}

			// A lone date inside a range we already captured would double-count it.
			const withoutRanges = ranges.reduce((text, range) => text.replace(range, " "), line.text);
			for (const match of normalizeNumericDigits(withoutRanges).matchAll(SINGLE_PATTERN)) {
				const raw = withoutRanges.slice(match.index, match.index + match[0].length);
				if (!looksLikeDateWords(raw, locale)) continue;
				const token = toToken(raw.trim(), "single", line.page, lineIndex, locale, now);
				token.segmentX = line.x;
				tokens.push(token);
			}

			for (const match of numeric.matchAll(AMBIGUOUS_NUMERIC_PATTERN))
				ambiguousNumericDates.push(line.text.slice(match.index, match.index + match[0].length));
		}
	});

	return {
		tokens,
		unparseableRanges: [...new Set(unparseableRanges)],
		ambiguousNumericDates: [...new Set(ambiguousNumericDates)],
		gaps: findGaps(experienceTokens),
	};
}

/**
 * A gap is reported, never scored. Time out of work is not a defect, and pretending a tool can
 * tell a sabbatical from a layoff from two numbers would be dishonest.
 */
function findGaps(tokens: readonly DateToken[]): { from: number; to: number; before: DateToken; after: DateToken }[] {
	const ranges = tokens
		.filter((token) => token.kind === "range" && token.parsed && token.startYear !== null)
		.map((token) => ({
			token,
			start: token.startYear as number,
			end: token.ongoing ? Number.POSITIVE_INFINITY : (token.endYear ?? (token.startYear as number)),
		}))
		.sort((a, b) => a.start - b.start);

	const gaps: { from: number; to: number; before: DateToken; after: DateToken }[] = [];
	let covered = Number.NEGATIVE_INFINITY;
	let last: DateToken | undefined;

	for (const range of ranges) {
		if (last && range.start - covered > 1) {
			gaps.push({ from: covered, to: range.start, before: last, after: range.token });
		}
		if (range.end > covered) {
			covered = range.end;
			last = range.token;
		}
	}

	return gaps.filter((gap) => Number.isFinite(gap.from) && Number.isFinite(gap.to));
}
