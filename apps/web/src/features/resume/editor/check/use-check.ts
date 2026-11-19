import type { CheckIssue } from "./issues";
import type { AtsReport } from "@reactive-resume/resume/ats";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { useLingui } from "@lingui/react";
import { useDeferredValue } from "react";
import { getCachedCheck } from "./check-cache";
import { useResumeData } from "@/features/resume/builder/draft";

export type CheckResult = { data: ResumeData; report: AtsReport; issues: CheckIssue[] };

/** The live checks on the resume as it is now (deferred, so typing stays smooth), with numbered issues. */
export function useCheck(): CheckResult | null {
	const data = useDeferredValue(useResumeData());
	const { i18n } = useLingui();
	return data ? getCachedCheck(data, i18n.locale) : null;
}
