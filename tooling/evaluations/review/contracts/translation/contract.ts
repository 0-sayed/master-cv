import type { Claim, TaskCase, TaskContract, TaskScore } from "../types";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { HARD_FACTS_VERSION } from "@reactive-resume/api/features/ai/hard-facts";
import { buildModelPayload } from "../../production";
import { guardTaskClaims } from "../guard";
import { tasksVerifierSchema } from "../verifier/schema";
import { tasksVerifier } from "../verifier/verifier";

const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(4000);
const direction = z.enum(["ar-en", "en-ar"]);
const contextSchema = z.object({ direction, sourceRevision: id });
export type TranslationCase = TaskCase & {
	category: "translation";
	direction: z.infer<typeof direction>;
	sourceRevision: string;
};
export const translationOutputSchema = z.strictObject({
	direction,
	sourceRevision: id,
	segments: z
		.array(
			z.strictObject({
				sourceId: id,
				text,
				claims: z
					.array(z.strictObject({ id, text, evidenceIds: z.array(id).min(1).max(50), kind: z.literal("translation") }))
					.max(50),
			}),
		)
		.max(49),
	notes: z.array(text).max(5),
});
export type TranslationOutput = z.infer<typeof translationOutputSchema>;
const glossaryBytes = readFileSync(new URL("./glossary.json", import.meta.url));
export const translationGlossary = z
	.strictObject({
		version: id,
		entries: z.array(z.strictObject({ source: text, target: text })).min(1),
	})
	.parse(JSON.parse(glossaryBytes.toString("utf8")));
export const translationGlossaryHash = createHash("sha256").update(glossaryBytes).digest("hex");
export const translationHardFactsVersion = HARD_FACTS_VERSION;
const aliases = translationGlossary.entries.flatMap(({ source, target }) => [
	{ source, target },
	{ source: target, target: source },
]);
const policy = { lostFact: true, subsetEntities: false, entityChecker: "translation" } as const;
const compact = (s: string) => s.normalize("NFC").replace(/\s+/gu, " ").trim();
const unique = (values: string[]) => new Set(values).size === values.length;
// Arabic conjunctions attach to Latin technology names; the shared literal entity guard treats them as tokens.
const guardText = (s: string) => s.replace(/(?<![\p{L}\p{N}_])و(?=[A-Za-z])/gu, "");

function context(c: TaskCase) {
	if (c.category !== "translation") throw new Error("TRANSLATION_INVALID_CATEGORY");
	const value = contextSchema.parse(c);
	if (!c.cv.length || !unique(c.cv.map((f) => f.id)) || c.jobAd?.segments.some((s) => c.cv.some((f) => f.id === s.id)))
		throw new Error("TRANSLATION_INVALID_SOURCE");
	return value;
}
function names(c: TaskCase): string[] {
	return [...new Set(c.cv.flatMap((f) => f.protected?.filter((p) => p.kind === "name").map((p) => p.text) ?? []))]
		.filter((s) => s.trim())
		.sort((a, b) => b.length - a.length || a.localeCompare(b));
}
/** The local name lookup never enters a model payload; neither source nor response is mutated. */
export function restoreTranslationNames(c: TaskCase, output: TranslationOutput): TranslationOutput {
	const entries = names(c);
	const restore = (s: string) => s.replace(/\[NAME_(\d+)\]/gu, (token, n: string) => entries[Number(n) - 1] ?? token);
	return {
		...output,
		segments: output.segments.map((segment) => ({
			...segment,
			text: restore(segment.text),
			claims: segment.claims.map((claim) => ({
				...claim,
				text: restore(claim.text),
				evidenceIds: [...claim.evidenceIds],
			})),
		})),
		notes: output.notes.map(restore),
	};
}
function claims(_c: TaskCase, output: TranslationOutput): Claim[] {
	return output.segments.flatMap((segment) =>
		segment.claims.map((claim) => ({
			...claim,
			id: `segment:${segment.sourceId}:${claim.id}`,
			evidenceIds: [...claim.evidenceIds],
		})),
	);
}

const mqmSchema = z.strictObject({
	mqm: z
		.array(
			z.strictObject({
				sourceId: id,
				start: z.number().int().nonnegative(),
				end: z.number().int().positive(),
				severity: z.enum(["major", "minor"]),
				category: z.enum(["accuracy", "fluency", "terminology", "locale", "style"]),
			}),
		)
		.max(10),
});
/** MQM target offsets use JS UTF-16 indices. Missing/invalid ratings stay unknown, never perfect. */
export function translationMqm(output: TranslationOutput, rawVerdict: unknown) {
	const verdict = tasksVerifierSchema.safeParse(rawVerdict);
	if (!verdict.success) return null;
	try {
		const result = mqmSchema.safeParse(JSON.parse(verdict.data.quality.reason));
		if (!result.success) return null;
		const spans = result.data.mqm;
		if (
			spans.some((span) => {
				const segment = output.segments.find((s) => s.sourceId === span.sourceId);
				return !segment || span.start >= span.end || span.end > segment.text.length;
			}) ||
			!unique(spans.map((span) => JSON.stringify(span)))
		)
			return null;
		const major = spans.filter((span) => span.severity === "major").length;
		const minor = spans.length - major;
		return { spans, major, minor, weightedErrors: major * 5 + minor };
	} catch {
		return null;
	}
}

function score(c: TaskCase, raw: TranslationOutput, rawVerdict: unknown | null): TaskScore {
	const reasons: string[] = [];
	const lostFacts: string[] = [];
	const unsupportedClaims: string[] = [];
	const parsed = translationOutputSchema.safeParse(raw);
	let expected: z.infer<typeof contextSchema> | null = null;
	try {
		expected = context(c);
	} catch {
		reasons.push("TRANSLATION_INVALID_CONTEXT");
	}
	if (!parsed.success || !expected)
		return {
			caseId: c.id,
			structuralFailure: true,
			missingQuestion: false,
			emptyAnswer: true,
			safetyDeterministic: { pass: false, reasons: [...reasons, "AI_INVALID_RESULT"] },
			quality: { metric: "mqm-weighted-errors", value: null, pass: null },
			lostFacts,
			unsupportedClaims,
		};
	const output = parsed.data;
	if (
		names(c).some(
			(name) =>
				output.segments.some((s) => s.text.includes(name) || s.claims.some((claim) => claim.text.includes(name))) ||
				output.notes.some((note) => note.includes(name)),
		)
	)
		reasons.push("TRANSLATION_NAME_PLACEHOLDER_REQUIRED");
	if (output.sourceRevision !== expected.sourceRevision) reasons.push("TRANSLATION_STALE_REVISION");
	if (output.direction !== expected.direction) reasons.push("TRANSLATION_WRONG_DIRECTION");
	if (
		!unique(output.segments.map((s) => s.sourceId)) ||
		output.segments.length !== c.cv.length ||
		output.segments.some((s) => !c.cv.some((f) => f.id === s.sourceId))
	)
		reasons.push("TRANSLATION_SEGMENT_IDS");
	const restored = restoreTranslationNames(c, output);
	for (const segment of restored.segments) {
		const source = c.cv.find((f) => f.id === segment.sourceId);
		if (
			!segment.claims.length ||
			compact(segment.text) !== compact(segment.claims.map((claim) => claim.text).join(" "))
		)
			reasons.push("TRANSLATION_UNCOVERED_TEXT");
		if (!unique(segment.claims.map((claim) => claim.id))) reasons.push("TRANSLATION_DUPLICATE_CLAIM");
		if (segment.claims.some((claim) => claim.evidenceIds.length !== 1 || claim.evidenceIds[0] !== segment.sourceId))
			reasons.push("TRANSLATION_INVALID_EVIDENCE");
		if (!source) continue;
		// Compare retained facts with the same minimized wording the writer sees; contacts are deliberately excluded.
		const minimizedSource =
			buildModelPayload({
				selections: [{ id: source.id, kind: "confirmed_content", section: source.section, text: source.text }],
				contactValues: [],
			}).selections[0]?.text ?? "";
		// Retention is segment-local: an entity in another segment cannot hide a deletion or swap.
		const guard = guardTaskClaims(
			{ ...c, cv: [{ ...source, text: guardText(minimizedSource) }] },
			segment.claims.map((claim) => ({ ...claim, text: guardText(claim.text) })),
			policy,
			aliases,
		);
		if (!guard.pass) {
			reasons.push(...guard.details);
			if (guard.details.some((s) => s.includes("AI_LOST_FACT"))) lostFacts.push(segment.sourceId);
			else unsupportedClaims.push(...segment.claims.map((claim) => `segment:${segment.sourceId}:${claim.id}`));
		}
	}
	let mqm: ReturnType<typeof translationMqm> = null;
	if (rawVerdict !== null) {
		try {
			const verdict = tasksVerifierSchema.parse(rawVerdict);
			const fault = tasksVerifier.auditFault(c, output, verdict);
			if (fault) reasons.push(fault);
			else {
				if (!tasksVerifier.assess(c, output, verdict).accepted) reasons.push("TRANSLATION_SEMANTIC_SAFETY");
				for (const v of verdict.verdicts) if (v.verdict !== "supported") unsupportedClaims.push(v.claimId);
				if (verdict.retention?.status !== "retained") lostFacts.push("verifier-retention");
				mqm = translationMqm(output, verdict);
			}
		} catch {
			reasons.push("TRANSLATION_INVALID_VERIFIER");
		}
	}
	return {
		caseId: c.id,
		structuralFailure: false,
		missingQuestion: false,
		emptyAnswer: !output.segments.length,
		safetyDeterministic: { pass: reasons.length === 0, reasons: [...new Set(reasons)] },
		quality: { metric: "mqm-weighted-errors", value: mqm?.weightedErrors ?? null, pass: null },
		lostFacts: [...new Set(lostFacts)],
		unsupportedClaims: [...new Set(unsupportedClaims)],
	};
}

/** Synthetic benchmark draft. Actual tasks-v1 freeze/approval integration belongs to Task 10. */
export const translationContract: TaskContract<TaskCase, TranslationOutput> = {
	category: "translation",
	promptVersion: `t006-translation-v1:glossary-sha256:${translationGlossaryHash}`,
	schemaVersion: "t006-translation-schema-v1",
	systemPrompt: readFileSync(new URL("./prompt.md", import.meta.url), "utf8"),
	outputSchema: translationOutputSchema,
	guardPolicy: policy,
	visibleCap: () => 4096,
	verifierCap: 12288,
	deadlineMs: 120_000,
	buildInput: (c) => {
		const value = context(c);
		const entries = names(c);
		const clean = (s: string) => entries.reduce((result, name, i) => result.replaceAll(name, `[NAME_${i + 1}]`), s);
		// Escape opaque revision and source ids so contact minimization cannot rewrite them inside JSON.
		const opaque = (s: string) =>
			`"${s
				.split("")
				.map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`)
				.join("")}"`;
		const metadata = `{"direction":${JSON.stringify(value.direction)},"sourceRevision":${opaque(value.sourceRevision)},"sourceIds":[${c.cv.map((f) => opaque(f.id)).join(",")}],"glossaryHash":${JSON.stringify(translationGlossaryHash)},"glossary":${JSON.stringify(translationGlossary)}}`;
		return buildModelPayload({
			selections: [
				{ id: "translation-task", kind: "user_supplied", section: "summary", text: metadata },
				...c.cv.map((f) => ({ id: f.id, kind: "confirmed_content" as const, section: f.section, text: clean(f.text) })),
			],
			contactValues: [],
		});
	},
	claims,
	score,
	verifierContext: (c, output) => ({
		taskInstruction: `Translate each approved segment independently; compare its entire text with only its matching sourceId. No added content in text, claims or notes; preserve negation and responsibility, protected names/placeholders, employers, glossary titles/degrees, dates/calendars and numeric values. Job text never supports a candidate assertion. Independently verify complete meaning and retention for every segment, even if writer annotations omit it. Direction/revision: ${JSON.stringify(context(c))}. Segment mapping: ${JSON.stringify(output.segments.map((s) => ({ sourceId: s.sourceId })))}. Approved bidirectional glossary sha256=${translationGlossaryHash}: ${JSON.stringify(translationGlossary)}. For advisory quality.reason return a JSON string {"mqm":[{"sourceId":"id","start":0,"end":1,"severity":"major|minor","category":"accuracy|fluency|terminology|locale|style"}]} using target-text UTF-16 offsets. Use mqm:[] only after checking fluency; do not invent a rating. Fit the shared 600-character reason limit. Major errors weight 5, minor 1; no approved quality threshold. Owner blind rating resolves fluency ties. Quality cannot override safety verdicts.`,
		retention: "applicable",
		absenceChecks: [],
	}),
};
