import { normalizeNumericDigits } from "@reactive-resume/utils/string";

type DateRun = { text: string; numeric?: boolean };
const year = String.raw`(?:1[3-9]\d{2}|20\d{2}|21\d{2})`;
const endpoint = `${year}(?:-\\d{2}(?:-\\d{2})?)?|\\d{1,2}/(?:\\d{1,2}/)?${year}`;
const candidate = new RegExp(
	`(?<![^\\s\u200e\u200f])(${endpoint})(\\s+هـ)?\\s*[–—-]\\s*(${endpoint})(\\s+هـ)?(?=$|\\s|[.,;:!?،؛)]+(?=$|\\s))`,
	"gu",
);

function order(value: string): number | undefined {
	const parts = value.split(/[-/]/u).map(Number);
	if (value.includes("/")) parts.reverse();
	const [y, m = 1, d = 1] = parts;
	if (!y || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
	if (parts.length === 3 && d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return undefined;
	return y * 10000 + m * 100 + d;
}

/** Display only: isolate endpoints separately so a range reads naturally in an RTL paragraph. */
export function freeTextDateRuns(source: string, paragraph = source): DateRun[] {
	const text = normalizeNumericDigits(source);
	const guard = normalizeNumericDigits(paragraph);
	if (
		/\+\s*\d|@|:\/\//u.test(guard) ||
		/\b(?:phone|tel|mobile|salary|price|cost|budget|SAR|USD)\b|(?:ال)?(?:هاتف|جوال|راتب|ريال|سعر|تكلفة|ميزانية)/iu.test(
			guard,
		)
	)
		return [{ text }];
	const runs: DateRun[] = [];
	let cursor = 0;
	for (const match of text.matchAll(candidate)) {
		const [, start, firstSuffix, end, lastSuffix] = match;
		if (!start || !end || Boolean(firstSuffix) !== Boolean(lastSuffix)) continue;
		// A phone, URL or larger identifier must never be interpreted as a free-text date.
		const before =
			text
				.slice(0, match.index)
				.split(/[\n\r]/u)
				.at(-1) ?? "";
		if (/(?:^|\s)[(\d][\d\s()-]*$/u.test(before) || /^\s+[(\d]/u.test(text.slice(match.index + match[0].length)))
			continue;
		// No calendar inference for full Hijri dates; this rule recognizes Hijri year ranges only.
		if (firstSuffix && /[-/]/u.test(start)) continue;
		const a = order(start);
		const b = order(end);
		if (
			a === undefined ||
			b === undefined ||
			a > b ||
			start.includes("/") !== end.includes("/") ||
			start.split(/[-/]/u).length !== end.split(/[-/]/u).length
		)
			continue;
		if (match.index > cursor) runs.push({ text: text.slice(cursor, match.index) });
		const display = (value: string) =>
			value.replace(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/u, (_, y, m, d) => (d ? `${d}/${m}/${y}` : `${m}/${y}`));
		runs.push({ text: display(start), numeric: true });
		runs.push({ text: `${firstSuffix ? " هـ" : ""} - ` });
		runs.push({ text: display(end), numeric: true });
		if (lastSuffix) runs.push({ text: " هـ" });
		cursor = match.index + match[0].length;
	}
	if (cursor < text.length || runs.length === 0) runs.push({ text: text.slice(cursor) });
	return runs;
}
