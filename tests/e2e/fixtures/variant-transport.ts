import type { VariantSnapshot } from "@reactive-resume/api/features/ai/variant-types";
/** Scripted transport for synthetic browser fixtures only; identity output does not measure translation quality. */
export function scriptedVariantResponse(selections: Array<{ id: string; text: string }>): unknown {
	const task = selections.find((item) => item.id === "variant-task");
	if (task) {
		const source = JSON.parse(task.text) as VariantSnapshot;
		if (source.jobAd?.segments.some((span) => span.text === "Synthetic provider failure"))
			return new Response(JSON.stringify({ error: "Synthetic provider failure" }), { status: 503 });
		if (source.category === "job-evidence")
			return {
				requirements: (source.jobAd?.segments ?? []).map((span, index) => ({
					id: `requirement-${index}`,
					spanIds: [span.id],
					importance: "unstated",
					verdict: span.text === "TypeScript and SAP required" ? "partial" : "no_evidence",
					evidenceIds: span.text === "TypeScript and SAP required" ? source.cv.slice(0, 1).map((fact) => fact.id) : [],
					explanation:
						span.text === "TypeScript and SAP required"
							? source.cv[0]?.text
							: "No supporting evidence was found in this CV.",
				})),
				notes: [],
			};
		if (source.category === "translation")
			return {
				direction: source.direction,
				sourceRevision: source.sourceRevision,
				segments: source.cv.map((item) => ({
					sourceId: item.id,
					text: item.text,
					claims: [{ id: "translation", text: item.text, evidenceIds: [item.id], kind: "translation" }],
				})),
				notes: [],
			};
		if (source.category === "summary")
			return {
				summary: {
					text: source.cv.map((fact) => fact.text).join(" "),
					claims: source.cv.map((fact, index) => ({
						id: `fact-${index}`,
						text: fact.text,
						evidenceIds: [fact.id],
						kind: "fact",
					})),
				},
				questions: source.cv.length
					? []
					: [{ id: "work", prompt: "What work or study can you confirm?", evidenceIds: [] }],
				notes: [],
			};
		if (source.category === "tailoring" && source.variant)
			return {
				resumeId: source.resumeId,
				baseRevision: source.sourceRevision,
				patches: source.variant.fields.flatMap((field, index) => {
					const after = field.text.replace(/\bBuilt\b/gu, "Developed");
					if (after === field.text) return [];
					return [
						{
							id: `wording-${index}`,
							target: {
								resumeId: source.resumeId,
								baseRevision: source.sourceRevision,
								sectionId: field.sectionId,
								itemId: field.itemId,
								roleId: field.roleId,
								field: field.field,
							},
							before: field.text,
							after,
							why: "Focus the wording on the confirmed TypeScript work without adding facts.",
							evidenceIds: field.evidenceIds,
							claims: [{ id: "wording", text: after, evidenceIds: field.evidenceIds, kind: "fact" }],
						},
					];
				}),
				order: [],
				notes: [],
			};
	}
	const verification = selections.find((item) => item.id === "variant-verification-task");
	if (verification) {
		const inventory = JSON.parse(verification.text) as {
			claims: Array<{ id: string; evidenceIds: string[] }>;
			premises: Array<{ id: string }>;
			absence: Array<{ id: string }>;
			retention: boolean;
		};
		const cvEvidence = selections.find((item) => item.id === "variant-cv-evidence");
		if (!cvEvidence) throw new Error("Missing synthetic CV evidence");
		const evidence = JSON.parse(cvEvidence.text) as Array<{
			id: string;
		}>;
		const reason = "Scripted synthetic fixture; no semantic quality qualification.";
		return {
			schemaVersion: 1,
			verdicts: inventory.claims.map((claim) => ({
				claimId: claim.id,
				verdict: "supported",
				evidenceIds: claim.evidenceIds,
				reason,
			})),
			retention: inventory.retention
				? { status: "retained", evidenceIds: evidence.map((item) => item.id), reason }
				: null,
			absence: inventory.absence.map((item) => ({ id: item.id, verdict: "confirmed_absent" })),
			coverage: { status: "complete", reason },
			premises: inventory.premises.map((item) => ({ id: item.id, verdict: "no_candidate_premise", reason })),
			quality: { status: "appropriate", reason },
		};
	}
	return undefined;
}
