import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { i18n } from "@lingui/core";
import { lintResumeForAts } from "@reactive-resume/resume/ats";
import { buildIssues } from "./issues";

type CheckResult = {
	data: ResumeData;
	report: ReturnType<typeof lintResumeForAts>;
	issues: ReturnType<typeof buildIssues>;
};
let contentKeys = new WeakMap<ResumeData, string>();
let cached:
	| { content: string; day: string; report: CheckResult["report"]; localized: Map<string, CheckResult> }
	| undefined;

export function clearCheckCache() {
	cached = undefined;
	contentKeys = new WeakMap();
}

/** One immutable content revision, shared by every panel and page. Released when the editor closes. */
function getEntry(data: ResumeData, day: string) {
	let content = contentKeys.get(data);
	if (content === undefined) {
		// The serialized content is a collision-free cache key. Each immutable revision is serialized once.
		content = JSON.stringify(data);
		contentKeys.set(data, content);
	}
	if (!cached || cached.content !== content || cached.day !== day) {
		cached = { content, day, report: lintResumeForAts(data), localized: new Map() };
	}
	return cached;
}

export function getCachedReport(data: ResumeData) {
	return getEntry(data, new Date().toISOString().slice(0, 10)).report;
}

export function getCachedCheck(
	data: ResumeData,
	locale = i18n.locale,
	day = new Date().toISOString().slice(0, 10),
): CheckResult {
	const entry = getEntry(data, day);
	const previous = entry.localized.get(locale);
	if (previous?.data === data) return previous;
	const result = { data, report: entry.report, issues: previous?.issues ?? buildIssues(entry.report, data) };
	entry.localized.set(locale, result);
	return result;
}
