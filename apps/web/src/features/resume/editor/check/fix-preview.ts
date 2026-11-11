import type { EditorIdentity } from "../store";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { isEqual } from "es-toolkit";
import { sameEditorIdentity } from "../store";
export type FixPreview = {
	identity: EditorIdentity;
	before: ResumeData;
	after: ResumeData;
	changes: { before: string; after: string }[];
};
export function prepareFix(identity: EditorIdentity, data: ResumeData, apply: (data: ResumeData) => void): FixPreview {
	const before = structuredClone(data);
	const after = structuredClone(data);
	apply(after);
	const changes: FixPreview["changes"] = [];
	const walk = (a: unknown, b: unknown) => {
		if (isEqual(a, b)) return;
		if (a && b && typeof a === "object" && typeof b === "object") {
			const left = a as Record<string, unknown>;
			const right = b as Record<string, unknown>;
			for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(left[key], right[key]);
		} else changes.push({ before: a === undefined ? "" : String(a), after: b === undefined ? "" : String(b) });
	};
	walk(before, after);
	return { identity: { ...identity }, before, after, changes };
}
export function acceptFix(
	preview: FixPreview,
	identity: EditorIdentity | null,
	data: ResumeData,
	apply: (data: ResumeData) => void,
) {
	if (!sameEditorIdentity(preview.identity, identity) || !isEqual(preview.before, data)) return false;
	apply(structuredClone(preview.after));
	return true;
}
