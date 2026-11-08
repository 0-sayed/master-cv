import type { Gold } from "./types";
import { factFieldSpan } from "./fact-policy";

/** Source-owned, exclusive spans; no renderer access or reassignment across headings. */
export function entryAssociationFailures(
	gold: Gold,
	text: string,
	observed: string,
	normalize: (value: string) => string,
): string[] {
	const entries = gold.entrySpans ?? [];
	// Heading capitalization is a template presentation choice; owner identities remain exact.
	const headingSpan = (haystack: string, value: string) => {
		const exact = factFieldSpan(haystack, { id: "heading", value: normalize(value) });
		const upper = factFieldSpan(haystack, { id: "heading", value: normalize(value.toUpperCase()) });
		// Letter spacing in English section headers may extract between any pair of letters.
		// Match only the source heading's uppercase letters, with whole-word boundaries.
		const spaced = /^[A-Za-z]+$/u.test(value)
			? new RegExp(`(?<![\\p{L}\\p{M}])${[...value.toUpperCase()].join("\\s*")}(?![\\p{L}\\p{M}])`, "u").exec(haystack)
			: undefined;
		return [exact, upper, spaced ? { start: spaced.index, end: spaced.index + spaced[0].length } : undefined]
			.filter((span) => span !== undefined)
			.sort((a, b) => a.start - b.start)[0];
	};
	const breaks = [...observed.matchAll(/\r?\n/gu)].map((match) => normalize(observed.slice(0, match.index)).length);
	const anchors = new Map<string, { start: number; end: number; lower: number }>();
	for (const entry of entries) {
		let lower = 0;
		let upper = text.length;
		if (entry.section) {
			const section = headingSpan(text, entry.section);
			if (!section) continue;
			lower = section.end;
			for (const value of entry.headings ?? entries.flatMap((other) => (other.section ? [other.section] : []))) {
				const next = headingSpan(text.slice(lower), value);
				if (next) upper = Math.min(upper, lower + next.start);
			}
		}
		if (entry.after) {
			const parent = anchors.get(entry.after);
			if (!parent) continue;
			lower = Math.max(lower, parent.end);
		}
		const found = factFieldSpan(text.slice(lower, upper), {
			id: entry.id,
			value: normalize(entry.anchor),
			occurrence: entry.occurrence,
		});
		if (found) anchors.set(entry.id, { start: lower + found.start, end: lower + found.end, lower });
	}
	const starts = new Map([...anchors].map(([id, anchor]) => [id, anchor.start]));
	const endOf = (id: string) => {
		const entry = entries.find((entry) => entry.id === id);
		const anchor = anchors.get(id);
		if (!entry || !anchor) return text.length;
		let end = text.length;
		for (const value of entry.next) {
			const owners = entries.filter((other) => other.id !== id && other.anchor === value);
			if (owners.length) {
				for (const owner of owners) {
					const other = anchors.get(owner.id);
					if (other && other.start >= anchor.end) end = Math.min(end, starts.get(owner.id) ?? other.start);
				}
			} else {
				const found = entry.headings?.includes(value)
					? headingSpan(text.slice(anchor.end), value)
					: factFieldSpan(text.slice(anchor.end), { id: "boundary", value: normalize(value) });
				if (found) end = Math.min(end, anchor.end + found.start);
			}
		}
		return end;
	};
	const hasDate = (start: number, end: number, value: string) =>
		Boolean(factFieldSpan(text.slice(start, end), { id: "date", value: normalize(value), match: "date" }));
	// Prefer the trailing interval. Only missing dates may use same-line RTL leading text.
	// Recompute after a following owner claims its token, preventing repeated-date reuse.
	for (let pass = 0; pass < entries.length; pass++) {
		let changed = false;
		for (const entry of entries) {
			const anchor = anchors.get(entry.id);
			if (!anchor || entry.allowLeading === false) continue;
			for (const value of entry.dates) {
				if (hasDate(starts.get(entry.id) ?? anchor.start, endOf(entry.id), value)) continue;
				const prefix = text.slice(anchor.lower, anchor.start);
				for (let occurrence = 0; ; occurrence++) {
					const found = factFieldSpan(prefix, { id: "leading", value: normalize(value), match: "date", occurrence });
					if (!found) break;
					const start = anchor.lower + found.start;
					const end = anchor.lower + found.end;
					if (
						!prefix.slice(found.end).trim() &&
						!breaks.some((position) => position >= end && position < anchor.start) &&
						start < (starts.get(entry.id) ?? anchor.start)
					) {
						starts.set(entry.id, start);
						changed = true;
					}
				}
			}
		}
		if (!changed) break;
	}
	return entries
		.filter((entry) => {
			const anchor = anchors.get(entry.id);
			if (!anchor) return true;
			const start = starts.get(entry.id) ?? anchor.start;
			const end = endOf(entry.id);
			return entry.dates.some((value) => !hasDate(start, end, value));
		})
		.map((entry) => entry.id);
}
