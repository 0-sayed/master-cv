import type { RawPage } from "@reactive-resume/resume/ats-pdf";
import type { ResumeData } from "@reactive-resume/schema/resume/data";

export type QualificationPolicy = "strict v1" | "fact-level v2" | "fact-level v2.1";
export type Gold = {
	review: { status: "draft" | "reviewed"; reviewer?: string | undefined; date?: string | undefined };
	text: string;
	fields: {
		id: string;
		value: string;
		occurrence?: number | undefined;
		/** Source-authored opt-in. Unmarked protected facts always stay exact. */
		match?: "date" | "mixed-free-text" | undefined;
	}[];
	associations: { id: string; fields: string[] }[];
	order: [string, string][];
	forbidden: string[];
	/** Source-derived exclusive owner bounds, used only by v2.1. */
	entrySpans?: {
		id: string;
		anchor: string;
		dates: string[];
		next: string[];
		section?: string | undefined;
		occurrence?: number | undefined;
		after?: string | undefined;
		allowLeading?: boolean | undefined;
		headings?: string[] | undefined;
	}[];
};
export type QualificationCase = {
	id: string;
	language: "ar" | "en" | "mixed";
	split: "smoke" | "development" | "held-out";
	paths: ("import" | "export")[];
	nativeInput?: string | undefined;
	data: ResumeData;
	gold: Gold;
};
export type ReaderEvidence = {
	reader: "pdfjs" | "poppler" | "poppler-layout";
	version: string;
	options: string[];
	status: "complete" | "failed";
	text: string;
	pages?: string[];
	/** Reader strings and geometry before line ordering or joining; never normalized. */
	rawPages?: readonly RawPage[];
	error?: string;
};
export type QualificationComparison = {
	policy: QualificationPolicy;
	observed: string;
	passed: boolean;
	acceptance: "failed" | "pending-review" | "accepted";
	exact: { recall: number | null };
	normalized: { recall: number | null };
	missing: string[];
	forbidden: string[];
	unexpectedNumbers: string[];
	orderFailures: string[];
	associationFailures: string[];
	characterErrorRate: number | null;
	wordErrorRate: number | null;
};
