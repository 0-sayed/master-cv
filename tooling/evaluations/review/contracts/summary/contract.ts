import type { Claim, TaskCase, TaskContract, TaskScore } from "../types";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { buildModelPayload } from "../../production";
import { guardTaskClaims } from "../guard";
import { tasksVerifierSchema } from "../verifier/schema";
import { tasksVerifier } from "../verifier/verifier";

const id = z.string().trim().min(1).max(200);
export const summaryOutputSchema = z.strictObject({
	summary: z.strictObject({
		text: z.string().max(4000),
		claims: z
			.array(
				z.strictObject({
					id,
					text: z.string().trim().min(1).max(4000),
					evidenceIds: z.array(id).min(1).max(50),
					kind: z.literal("fact"),
				}),
			)
			.max(20),
	}),
	questions: z
		.array(z.strictObject({ id, prompt: z.string().trim().min(1).max(600), evidenceIds: z.array(id).max(50) }))
		.max(5),
	notes: z.array(z.string().trim().min(1).max(600)).max(5),
});
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

function protectedNames(c: TaskCase): string[] {
	return [...new Set(c.cv.flatMap((f) => f.protected?.filter((p) => p.kind === "name").map((p) => p.text) ?? []))]
		.filter((name) => name.trim())
		.sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/** Restore model placeholders only after the call, without mutating the source or model output. */
export function restoreSummaryNames(c: TaskCase, output: SummaryOutput): SummaryOutput {
	const names = protectedNames(c);
	const restore = (text: string) =>
		text.replace(/\[NAME_(\d+)\]/gu, (placeholder, n: string) => names[Number(n) - 1] ?? placeholder);
	return {
		summary: {
			text: restore(output.summary.text),
			claims: output.summary.claims.map((claim) => ({
				...claim,
				text: restore(claim.text),
				evidenceIds: [...claim.evidenceIds],
			})),
		},
		questions: output.questions.map((q) => ({ ...q, prompt: restore(q.prompt), evidenceIds: [...q.evidenceIds] })),
		notes: output.notes.map(restore),
	};
}

const compact = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const guardPolicy = { lostFact: false, subsetEntities: true };

function score(c: TaskCase, output: SummaryOutput, rawVerdict: unknown | null): TaskScore {
	const reasons: string[] = [];
	const claims = restoreSummaryNames(c, output).summary.claims;
	const guard = guardTaskClaims(c, claims, guardPolicy);
	if (!guard.pass) reasons.push(...guard.details);
	if (compact(output.summary.text) !== compact(output.summary.claims.map((claim) => claim.text).join(" ")))
		reasons.push("SUMMARY_UNCOVERED_TEXT");
	const ids = [...claims.map((claim) => claim.id), ...output.questions.map((q) => q.id)];
	if (new Set(ids).size !== ids.length) reasons.push("SUMMARY_DUPLICATE_ID");
	const sourceIds = new Set(c.cv.map((fact) => fact.id));
	if (sourceIds.size !== c.cv.length || c.jobAd?.segments.some((segment) => sourceIds.has(segment.id)))
		reasons.push("SUMMARY_EVIDENCE_COLLISION");
	if (
		[...claims, ...output.questions].some(
			(item) =>
				new Set(item.evidenceIds).size !== item.evidenceIds.length ||
				item.evidenceIds.some((evidenceId) => !sourceIds.has(evidenceId)),
		)
	)
		reasons.push("SUMMARY_INVALID_EVIDENCE");
	let supportedIds: Set<string> | null = null;
	if (rawVerdict !== null) {
		try {
			const fault = tasksVerifier.auditFault(c, output, rawVerdict);
			if (fault) reasons.push(fault);
			else {
				const verdict = tasksVerifierSchema.parse(rawVerdict);
				supportedIds = new Set(verdict.verdicts.filter((v) => v.verdict === "supported").flatMap((v) => v.evidenceIds));
				if (!tasksVerifier.assess(c, output, verdict).accepted) reasons.push("SUMMARY_VERIFIER_REJECTED");
			}
		} catch {
			reasons.push("SUMMARY_INVALID_VERIFIER");
		}
	}
	const gold = summaryOutputSchema.safeParse(c.gold);
	// Gold annotations define required key facts. Citation coverage is advisory; the independent judge owns meaning.
	const requiredIds = new Set(
		c.cv.length && gold.success ? gold.data.summary.claims.flatMap((claim) => claim.evidenceIds) : [],
	);
	const covered =
		supportedIds ??
		new Set(
			claims.filter((claim) => guardTaskClaims(c, [claim], guardPolicy).pass).flatMap((claim) => claim.evidenceIds),
		);
	const coverage = requiredIds.size
		? [...requiredIds].filter((evidenceId) => covered.has(evidenceId)).length / requiredIds.size
		: null;
	return {
		caseId: c.id,
		structuralFailure: false,
		missingQuestion: (c.requiresQuestion || c.cv.length === 0) && output.questions.length === 0,
		emptyAnswer: !output.summary.text.trim() && output.questions.length === 0,
		safetyDeterministic: { pass: reasons.length === 0, reasons },
		quality: { metric: "required-key-fact-coverage", value: coverage, pass: coverage === null ? null : coverage === 1 },
		lostFacts: [],
		unsupportedClaims: reasons,
	};
}

export const summaryContract: TaskContract<TaskCase, SummaryOutput> = {
	category: "summary",
	promptVersion: "t006-summary-v1",
	schemaVersion: "t006-summary-schema-v1",
	systemPrompt: readFileSync(new URL("./prompt.md", import.meta.url), "utf8"),
	outputSchema: summaryOutputSchema,
	guardPolicy,
	visibleCap: () => 4096,
	verifierCap: 12288,
	deadlineMs: 90_000,
	buildInput: (c) => {
		const names = protectedNames(c);
		return buildModelPayload({
			selections: c.cv.length
				? c.cv.map((fact) => ({
						id: fact.id,
						kind: "confirmed_content",
						section: fact.section,
						text: names.reduce((text, name, i) => text.replaceAll(name, `[NAME_${i + 1}]`), fact.text),
					}))
				: [
						{
							id: "summary-empty-cv",
							kind: "user_supplied",
							section: "summary",
							text: "No confirmed CV facts were supplied. Ask for work or study evidence; do not invent a summary.",
						},
					],
			contactValues: [],
		});
	},
	claims: (_c, output): Claim[] =>
		output.summary.claims.map((claim) => ({ ...claim, evidenceIds: [...claim.evidenceIds] })),
	verifierContext: () => ({
		taskInstruction:
			"Summarize confirmed CV facts concisely. Verify every assertion in the complete summary, questions and notes independently of writer annotations. Require exact full-text claim coverage; check negation and responsibility escalation. Questions may request missing evidence but must not assume unsupported experience. Omitting unselected CV facts is allowed. Required-key-fact citation coverage is an advisory quality metric, not a retention safety gate.",
		retention: "not_applicable",
		absenceChecks: [],
	}),
	score,
};
