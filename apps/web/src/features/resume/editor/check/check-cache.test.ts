import { beforeEach, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { produce } from "immer";
import { lintResumeForAts } from "@reactive-resume/resume/ats";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { clearCheckCache, getCachedCheck } from "./check-cache";

beforeEach(() => {
	clearCheckCache();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});

it("shares rule evaluation and findings across panels and equal content revisions", () => {
	const first = getCachedCheck(defaultResumeData);
	expect(getCachedCheck(defaultResumeData)).toBe(first);
	const restored = getCachedCheck(structuredClone(defaultResumeData));
	expect(restored.report).toBe(first.report);
	expect(restored.issues).toBe(first.issues);
	expect(first.report).toEqual(lintResumeForAts(defaultResumeData));
});

it("invalidates findings when CV content or kept findings change", () => {
	const first = getCachedCheck(defaultResumeData);
	const edited = produce(defaultResumeData, (data) => {
		data.basics.name = "Nawaf";
	});
	const next = getCachedCheck(edited);
	expect(next.report).not.toBe(first.report);
	expect(next.report).toEqual(lintResumeForAts(edited));
	const finding = next.report.findings[0];
	if (!finding) throw new Error("Expected a finding in the empty CV fixture");
	const kept = produce(edited, (data) => {
		data.metadata.check = { ignored: [finding.key], hiddenTerms: [] };
	});
	expect(getCachedCheck(kept).report.findings).toHaveLength(next.report.findings.length - 1);
});

it("refreshes localized issues without rerunning rules and expires date-sensitive findings daily", () => {
	const first = getCachedCheck(defaultResumeData, "en-US", "2026-11-19");
	const arabic = getCachedCheck(defaultResumeData, "ar-SA", "2026-11-19");
	expect(arabic.report).toBe(first.report);
	expect(arabic.issues).not.toBe(first.issues);
	expect(getCachedCheck(defaultResumeData, "ar-SA", "2026-11-20").report).not.toBe(first.report);
	clearCheckCache();
	expect(getCachedCheck(defaultResumeData, "ar-SA", "2026-11-20").report).not.toBe(arabic.report);
});
