import type { EditorIdentity } from "../store";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { isEqual } from "es-toolkit";
import { hasBlankHeadingChange } from "@reactive-resume/resume/ats";
import { sameEditorIdentity } from "../store";
export type FixChoice = {
	label: string;
	kind: "heading" | "email";
	options: string[];
	value: string;
	apply: (data: ResumeData, value: string) => void;
};
export type FixPreview = {
	identity: EditorIdentity;
	before: ResumeData;
	after: ResumeData;
	changes: FixChange[];
	choices: FixChoice[];
};
export type FixChange = { path: string[]; before: unknown; after: unknown };
export function prepareFix(
	identity: EditorIdentity,
	data: ResumeData,
	apply: (data: ResumeData) => void,
	choices: FixChoice[] = [],
): FixPreview {
	const before = structuredClone(data);
	const after = structuredClone(data);
	apply(after);
	for (const choice of choices) choice.apply(after, choice.value);
	const changes: FixPreview["changes"] = [];
	const walk = (a: unknown, b: unknown, path: string[] = []) => {
		if (isEqual(a, b)) return;
		// Dates and column section lists are meaningful values, not individual storage keys.
		const field = path.at(-1);
		if (field === "dates" || (path.includes("layout") && (field === "main" || field === "sidebar"))) {
			changes.push({ path, before: a, after: b });
		} else if ((a && typeof a === "object") || (b && typeof b === "object")) {
			const left = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
			const right = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
			for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
				walk(left[key], right[key], [...path, key]);
		} else changes.push({ path, before: a, after: b });
	};
	walk(before, after);
	return { identity: { ...identity }, before, after, changes, choices };
}
export function chooseFix(preview: FixPreview, index: number, value: string): FixPreview {
	const choices = preview.choices.map((choice, current) => (current === index ? { ...choice, value } : choice));
	return prepareFix(
		preview.identity,
		preview.before,
		(data) => Object.assign(data, structuredClone(preview.after)),
		choices,
	);
}
export function fixIsValid(preview: FixPreview): boolean {
	return (
		preview.changes.length > 0 &&
		!hasBlankHeadingChange(preview.before, preview.after) &&
		preview.choices.every((choice) => Boolean(choice.value.trim()) && choice.options.includes(choice.value))
	);
}
export function acceptFix(
	preview: FixPreview,
	identity: EditorIdentity | null,
	data: ResumeData,
	apply: (data: ResumeData) => void,
) {
	if (!fixIsValid(preview) || !sameEditorIdentity(preview.identity, identity) || !isEqual(preview.before, data))
		return false;
	apply(structuredClone(preview.after));
	return true;
}
