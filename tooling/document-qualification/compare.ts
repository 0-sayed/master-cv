import type { Gold, QualificationComparison, QualificationPolicy } from "./types";
import assert from "node:assert/strict";
import { entryAssociationFailures } from "./entry-associations";
import { factFieldSpan } from "./fact-policy";

// Only reader wrappers, whitespace, canonical Unicode and numeric alphabets are equivalent.
// Letters, diacritics, source punctuation and word order remain significant.
function comparisonText(value: string): string {
	return value
		.normalize("NFC")
		.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
		.replace(/[٠-٩۰-۹]/gu, (char) => String(char.charCodeAt(0) - (char <= "٩" ? 0x660 : 0x6f0)))
		.replace(/\s+/gu, " ")
		.trim();
}
function distance<T>(left: readonly T[], right: readonly T[]): number {
	let row = Array.from({ length: right.length + 1 }, (_, i) => i);
	for (let i = 0; i < left.length; i++) {
		const next = [i + 1];
		for (let j = 0; j < right.length; j++) {
			const insertion = next[j];
			const deletion = row[j + 1];
			const substitution = row[j];
			assert(insertion !== undefined && deletion !== undefined && substitution !== undefined);
			next.push(Math.min(insertion + 1, deletion + 1, substitution + (left[i] === right[j] ? 0 : 1)));
		}
		row = next;
	}
	const result = row[right.length];
	assert(result !== undefined);
	return result;
}
function locate(text: string, value: string, occurrence = 0): number {
	let position = -1;
	for (let i = 0; i <= occurrence; i++) {
		position = text.indexOf(value, position + 1);
		if (position < 0) break;
	}
	return position;
}
export function compareQualification(
	gold: Gold,
	observed: string,
	policy: QualificationPolicy = "strict v1",
): QualificationComparison {
	if (policy !== "strict v1" && policy !== "fact-level v2" && policy !== "fact-level v2.1")
		throw new Error(`Unknown qualification policy: ${policy}`);
	const text = comparisonText(observed);
	const expected = comparisonText(gold.text);
	const fields = gold.fields.map((field) => ({ ...field, value: comparisonText(field.value) }));
	const spans = new Map(
		fields.map((field) => [field.id, policy !== "strict v1" ? factFieldSpan(text, field, fields) : undefined]),
	);
	const positions = new Map(
		fields.map((field) => [
			field.id,
			policy !== "strict v1"
				? (spans.get(field.id)?.start ?? -1)
				: locate(text, comparisonText(field.value), field.occurrence),
		]),
	);
	const position = (id: string) => positions.get(id) ?? -1;
	const missing = gold.fields
		.filter(
			(field) =>
				position(field.id) < 0 ||
				(/[\u202a-\u202e\u2066-\u2069]/u.test(field.value) && locate(observed, field.value, field.occurrence) < 0),
		)
		.map((field) => field.id);
	const exactCount = gold.fields.filter((field) => locate(observed, field.value, field.occurrence) >= 0).length;
	const orderFailures = gold.order
		.filter(([a, b]) => position(a) < 0 || position(b) < 0 || position(a) >= position(b))
		.map(([a, b]) => `${a}→${b}`);
	const ranges = gold.associations.map((group) => ({
		id: group.id,
		positions: group.fields.map((id) => positions.get(id) ?? -1),
		end: Math.max(...group.fields.map((id) => spans.get(id)?.end ?? positions.get(id) ?? -1)),
	}));
	const associationFailures = ranges
		.filter(
			(group, index) =>
				group.positions.some((p) => p < 0) ||
				ranges.some(
					(other, j) =>
						j !== index &&
						(policy !== "strict v1"
							? Math.min(...group.positions) < other.end && Math.min(...other.positions) < group.end
							: Math.min(...group.positions) <= other.end && Math.min(...other.positions) <= group.end),
				),
		)
		.map((group) => group.id);
	if (policy === "fact-level v2.1")
		associationFailures.push(...entryAssociationFailures(gold, text, observed, comparisonText));
	const expectedNumbers: string[] = Array.from(expected.match(/\d+/g) ?? []);
	const unexpectedNumbers: string[] = [];
	for (const number of text.match(/\d+/g) ?? []) {
		const index = expectedNumbers.indexOf(number);
		if (index < 0) unexpectedNumbers.push(number);
		else expectedNumbers.splice(index, 1);
	}
	const forbidden = gold.forbidden.filter((value) => text.includes(comparisonText(value)));
	const passed =
		gold.fields.length > 0 &&
		missing.length === 0 &&
		orderFailures.length === 0 &&
		associationFailures.length === 0 &&
		forbidden.length === 0 &&
		unexpectedNumbers.length === 0;
	const words = expected.split(" ");
	return {
		policy,
		observed,
		passed,
		acceptance: !passed ? "failed" : gold.review.status === "reviewed" ? "accepted" : "pending-review",
		exact: { recall: gold.fields.length ? exactCount / gold.fields.length : null },
		normalized: { recall: gold.fields.length ? (gold.fields.length - missing.length) / gold.fields.length : null },
		missing,
		orderFailures,
		associationFailures,
		forbidden,
		unexpectedNumbers,
		characterErrorRate: expected.length ? distance([...expected], [...text]) / [...expected].length : null,
		wordErrorRate: expected.length ? distance(words, text.split(" ")) / words.length : null,
	};
}
