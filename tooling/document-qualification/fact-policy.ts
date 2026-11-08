import type { Gold } from "./types";
import assert from "node:assert/strict";
import { localizedPresentLabels } from "@reactive-resume/schema/resume/dates";

export type FieldSpan = { start: number; end: number };
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const labels = [...new Set(["هـ", "م", "من", "إلى", "حتى", "حالياً", ...localizedPresentLabels])]
	.sort((a, b) => b.length - a.length)
	.map(escape)
	.join("|");
// Only the boundary between a number and a whole known label may lose whitespace.
const boundary = new RegExp(
	`(?<=\\d)\\s+(?=(?:${labels})(?![\\p{L}\\p{M}]))|(?<=(?<![\\p{L}\\p{M}])(?:${labels}))\\s+(?=\\d)`,
	"gu",
);

function dateProjection(text: string) {
	const removed = new Set<number>();
	for (const match of text.matchAll(boundary))
		for (let index = match.index; index < match.index + match[0].length; index++) removed.add(index);
	const offsets: number[] = [];
	let value = "";
	for (let index = 0; index < text.length; index++)
		if (!removed.has(index)) {
			value += text[index];
			offsets.push(index);
		}
	return { value, offsets };
}
function sameRun(left: string, right: string): boolean {
	return [/\d/u, /[\p{Script=Latin}_]/u, /[\p{Script=Arabic}\p{M}]/u].some(
		(script) => script.test(left) && script.test(right),
	);
}
function completeBoundary(
	text: string,
	start: number,
	end: number,
	field: Gold["fields"][number],
	facts: Gold["fields"],
): boolean {
	const value = field.value;
	const contact = /@|[a-z]\.[a-z]/iu.test(value);
	// A missing reader separator is accepted only beside a separately asserted exact source fact.
	const preceding = facts.some(
		(other) =>
			other.id !== field.id &&
			!other.match &&
			start >= other.value.length &&
			text.startsWith(other.value, start - other.value.length),
	);
	const following = facts.some((other) => other.id !== field.id && !other.match && text.startsWith(other.value, end));
	return (
		(!sameRun(value[0] ?? "", text[start - 1] ?? "") || preceding) &&
		(!sameRun(value.at(-1) ?? "", text[end] ?? "") || following) &&
		!(
			contact &&
			((/[./?#@_%~+-]/u.test(text[start - 1] ?? "") && !preceding) ||
				(/[./?#@_%~+-]/u.test(text[end] ?? "") && !following))
		)
	);
}

/** V2 never collects words across an arbitrary document: only an equal-length contiguous token window. */
export function factFieldSpan(
	text: string,
	field: Gold["fields"][number],
	facts: Gold["fields"] = [],
): FieldSpan | undefined {
	const occurrence = field.occurrence ?? 0;
	if (
		field.match === "mixed-free-text" &&
		/\p{Script=Arabic}/u.test(field.value) &&
		/\p{Script=Latin}/u.test(field.value)
	) {
		const expected = field.value.split(" ").sort();
		const tokens = [...text.matchAll(/\S+/gu)];
		let found = 0;
		for (let i = 0; i <= tokens.length - expected.length; i++) {
			const window = tokens.slice(i, i + expected.length);
			const values = window.map((token) => token[0]).sort();
			if (values.every((value, index) => value === expected[index]) && found++ === occurrence) {
				const first = window[0];
				const last = window.at(-1);
				assert(first && last);
				return { start: first.index, end: last.index + last[0].length };
			}
		}
		return undefined;
	}
	const projected = field.match === "date" ? dateProjection(text) : undefined;
	const haystack = projected?.value ?? text;
	const needle = field.match === "date" ? dateProjection(field.value).value : field.value;
	let position = -1;
	let found = 0;
	while ((position = haystack.indexOf(needle, position + 1)) >= 0) {
		if (!completeBoundary(haystack, position, position + needle.length, { ...field, value: needle }, facts)) continue;
		if (found++ !== occurrence) continue;
		const lastOffset = projected?.offsets[position + needle.length - 1];
		assert(!projected || lastOffset !== undefined);
		return {
			start: projected?.offsets[position] ?? position,
			end: lastOffset !== undefined ? lastOffset + 1 : position + needle.length,
		};
	}
	return undefined;
}
