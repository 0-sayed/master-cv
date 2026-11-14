import type { VariantSnapshot } from "./variant-types";
import { claimsCoverText, reviewTargetSchema } from "@reactive-resume/schema/resume/ai-review";
import {
	jobEvidenceSchema,
	summaryOutputSchema,
	tailoringOutputSchema,
	translationOutputSchema,
} from "@reactive-resume/schema/resume/variant-outputs";
import { buildModelPayload } from "./payload";
import { assertPatchRetention, guardTaskClaims } from "./variant-guard";

const unique = (ids: readonly string[]) => ids.length === new Set(ids).size;
function fail(reason: string): never {
	throw new Error(reason);
}
const compact = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const key = (target: { sectionId: string; itemId?: string | null; roleId?: string | null; field: string }) =>
	JSON.stringify([target.sectionId, target.itemId ?? null, target.roleId ?? null, target.field]);
function guard(
	snapshot: VariantSnapshot,
	claims: Parameters<typeof guardTaskClaims>[1],
	retain = false,
	translate = false,
) {
	const result = guardTaskClaims(
		snapshot,
		claims,
		{ lostFact: retain, subsetEntities: !translate, ...(translate ? { entityChecker: "translation" as const } : {}) },
		snapshot.translationAliases,
	);
	if (!result.pass) fail(result.error ?? "AI_GUARD_FAILED");
}
export function validateVariantOutput(snapshot: VariantSnapshot, raw: unknown) {
	const cvIds = snapshot.cv.map((fact) => fact.id);
	const jobIds = snapshot.jobAd?.segments.map((span) => span.id) ?? [];
	if (!unique(cvIds) || !unique(jobIds) || cvIds.some((id) => jobIds.includes(id))) fail("AI_EVIDENCE_COLLISION");
	const citations = (ids: string[], required = false) => {
		if (!unique(ids) || (required && !ids.length) || ids.some((id) => !cvIds.includes(id))) fail("AI_INVALID_EVIDENCE");
	};
	const common = {
		schemaVersion: 1 as const,
		sourceRevision: { kind: "resume" as const, id: snapshot.resumeId, revision: snapshot.sourceRevision },
	};
	if (snapshot.category === "job-evidence") {
		const output = jobEvidenceSchema.parse(raw);
		if (!unique(output.requirements.map((requirement) => requirement.id))) fail("JOB_DUPLICATE_REQUIREMENT");
		if (!snapshot.jobAd && output.requirements.length) fail("JOB_NOT_SUPPLIED");
		for (const requirement of output.requirements) {
			if (
				!requirement.spanIds.length ||
				!unique(requirement.spanIds) ||
				requirement.spanIds.some((id) => !jobIds.includes(id))
			)
				fail("JOB_INVALID_SPAN");
			citations(requirement.evidenceIds, ["supported", "partial"].includes(requirement.verdict));
			const wording =
				snapshot.jobAd?.segments
					.filter((span) => requirement.spanIds.includes(span.id))
					.map((span) => span.text)
					.join(" ") ?? "";
			if (
				requirement.importance === "essential" &&
				!/\b(?:must|required|essential|mandatory)\b|مطلوب|يشترط|ضروري/iu.test(wording)
			)
				fail("JOB_UNSUPPORTED_IMPORTANCE");
			if (
				requirement.importance === "preferred" &&
				!/\b(?:preferred|desirable|nice.to.have)\b|يفضل|مفضل/iu.test(wording)
			)
				fail("JOB_UNSUPPORTED_IMPORTANCE");
			if (["supported", "partial"].includes(requirement.verdict))
				guard(snapshot, [
					{ id: requirement.id, text: requirement.explanation, evidenceIds: requirement.evidenceIds, kind: "fact" },
				]);
			if (
				requirement.verdict === "no_evidence" &&
				!/(?:(?:this|supplied) (?:CV|resume)|هذه السيرة|السيرة الذاتية المقدمة)/iu.test(requirement.explanation)
			)
				fail("JOB_UNBOUNDED_ABSENCE");
		}
		for (const text of [...output.requirements.map((requirement) => requirement.explanation), ...output.notes])
			if (
				/\b(?:(?:ATS|match|compatibility|hiring) (?:score|probability|chance)|hiring chance|match\s+\d)\b|احتمال التوظيف|نسبة المطابقة|درجة التوافق|\byou lack\b|يفتقر المرشح/iu.test(
					text,
				)
			)
				fail("JOB_INVALID_ASSESSMENT");
		if (snapshot.jobAd && snapshot.cv.length)
			guard(
				snapshot,
				output.notes.map((text, index) => ({ id: `note:${index}`, text, evidenceIds: cvIds, kind: "fact" as const })),
			);
		return { ...common, kind: "review.job-evidence" as const, output };
	}
	if (snapshot.category === "summary") {
		const output = summaryOutputSchema.parse(raw);
		if (
			!claimsCoverText(output.summary.text, output.summary.claims) ||
			!unique([...output.summary.claims.map((claim) => claim.id), ...output.questions.map((question) => question.id)])
		)
			fail("SUMMARY_UNCOVERED_TEXT");
		for (const claim of output.summary.claims) citations(claim.evidenceIds, true);
		for (const question of output.questions) citations(question.evidenceIds);
		if (!snapshot.cv.length && (output.summary.text || !output.questions.length)) fail("SUMMARY_MISSING_QUESTION");
		guard(snapshot, output.summary.claims);
		return { ...common, kind: "review.summary" as const, output };
	}
	if (snapshot.category === "tailoring") {
		const output = tailoringOutputSchema.parse(raw);
		const variant = snapshot.variant;
		if (
			!variant ||
			output.resumeId !== variant.resumeId ||
			output.baseRevision !== variant.baseRevision ||
			snapshot.resumeId !== output.resumeId ||
			snapshot.sourceRevision !== output.baseRevision
		)
			fail("TAILORING_SOURCE_CHANGED");
		if (
			!unique(output.patches.map((patch) => patch.id)) ||
			!unique(output.patches.map((patch) => key(patch.target))) ||
			!unique(output.order.map((order) => order.sectionId))
		)
			fail("TAILORING_DUPLICATE_TARGET");
		for (const patch of output.patches) {
			const field = variant.fields.find((field) => key(field) === key(patch.target));
			const target = {
				sectionId: patch.target.sectionId,
				...(patch.target.itemId ? { itemId: patch.target.itemId } : {}),
				...(patch.target.roleId ? { roleId: patch.target.roleId } : {}),
				field: patch.target.field,
			};
			if (
				!field ||
				!reviewTargetSchema.safeParse(target).success ||
				patch.target.resumeId !== output.resumeId ||
				patch.target.baseRevision !== output.baseRevision ||
				patch.before !== field.text
			)
				fail("TAILORING_INVALID_TARGET");
			if (!claimsCoverText(patch.after, patch.claims) || !unique(patch.claims.map((claim) => claim.id)))
				fail("TAILORING_UNCOVERED_TEXT");
			citations(patch.evidenceIds, true);
			if (patch.claims.some((claim) => claim.evidenceIds.some((id) => !patch.evidenceIds.includes(id))))
				fail("AI_INVALID_EVIDENCE");
			guard(snapshot, patch.claims);
			assertPatchRetention(
				snapshot,
				patch.before,
				patch.claims,
				snapshot.cv
					.filter((fact) => patch.evidenceIds.includes(fact.id))
					.map((fact) => fact.text)
					.join("\n"),
			);
		}
		for (const order of output.order) {
			const original = variant.order.find((entry) => entry.sectionId === order.sectionId);
			if (
				!original ||
				!unique(order.itemIds) ||
				order.itemIds.length !== original.itemIds.length ||
				order.itemIds.some((id) => !original.itemIds.includes(id))
			)
				fail("TAILORING_INVALID_ORDER");
		}
		return { ...common, kind: "review.tailoring" as const, output };
	}
	const output = translationOutputSchema.parse(raw);
	if (output.sourceRevision !== snapshot.sourceRevision || output.direction !== snapshot.direction)
		fail("TRANSLATION_SOURCE_CHANGED");
	if (
		!unique(output.segments.map((segment) => segment.sourceId)) ||
		output.segments.length !== snapshot.cv.length ||
		output.segments.some((segment) => !cvIds.includes(segment.sourceId))
	)
		fail("TRANSLATION_SEGMENT_IDS");
	for (const segment of output.segments) {
		const source = snapshot.cv.find((fact) => fact.id === segment.sourceId);
		if (!source) fail("TRANSLATION_SEGMENT_IDS");
		if (
			!segment.claims.length ||
			compact(segment.text) !== compact(segment.claims.map((claim) => claim.text).join(" ")) ||
			!unique(segment.claims.map((claim) => claim.id))
		)
			fail("TRANSLATION_UNCOVERED_TEXT");
		if (segment.claims.some((claim) => claim.evidenceIds.length !== 1 || claim.evidenceIds[0] !== segment.sourceId))
			fail("TRANSLATION_INVALID_EVIDENCE");
		guard({ ...snapshot, cv: [source] }, segment.claims, true, true);
	}
	return { ...common, kind: "review.translation" as const, output };
}

/** Validation used for both writer and verifier prose; structure/IDs never pass through redaction. */
export function minimizedVariantText(text: string, contactValues: string[] = []): string {
	if (!text.trim()) return "";
	return (
		buildModelPayload({ selections: [{ id: "text", kind: "model_proposed", section: "summary", text }], contactValues })
			.selections[0]?.text ?? ""
	);
}
