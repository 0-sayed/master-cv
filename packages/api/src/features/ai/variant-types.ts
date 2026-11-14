import type { TailoringOutput } from "@reactive-resume/schema/resume/variant-outputs";

export type CvFact = {
	id: string;
	section: string;
	text: string;
	protected?: Array<{
		kind: "name" | "employer" | "title" | "date" | "number" | "skill" | "degree" | "certification" | "language";
		text: string;
	}>;
};
export type GuardPolicy = { lostFact: boolean; subsetEntities: boolean; entityChecker?: "translation" };
export type GuardResult = { pass: boolean; error: string | null; details: string[] };
export type Claim = {
	id: string;
	text: string;
	evidenceIds: string[];
	jobSpanIds?: string[];
	kind: "fact" | "premise" | "translation";
};
export type GuardContext = {
	category: string;
	cv: CvFact[];
	jobAd: { segments: Array<{ id: string; text: string }> } | null;
};
export type VariantSnapshot = GuardContext & {
	category: "job-evidence" | "tailoring" | "translation" | "summary";
	resumeId: string;
	sourceRevision: string;
	direction?: "ar-en" | "en-ar";
	variant?: {
		resumeId: string;
		baseRevision: string;
		fields: Array<
			Omit<TailoringOutput["patches"][number]["target"], "resumeId" | "baseRevision"> & {
				text: string;
				evidenceIds: string[];
			}
		>;
		order: TailoringOutput["order"];
	};
	translationAliases?: Array<{ source: string; target: string }>;
};
