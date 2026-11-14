import type { Claim, TaskCase, TaskContract, TaskScore } from "../types";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { claimsCoverText, proposalTargetSchema, reviewTargetSchema } from "@reactive-resume/schema/resume/ai-review";
import { buildModelPayload } from "../../production";
import { guardTaskClaims } from "../guard";
import { tasksVerifierSchema } from "../verifier/schema";
import { tasksVerifier } from "../verifier/verifier";

const id = z.string().trim().min(1).max(200);
const text = z
	.string()
	.trim()
	.min(1)
	.max(4000)
	.refine((s) => !/<[^>]*>/u.test(s), "Plain text required");
const evidenceIds = z
	.array(id)
	.min(1)
	.max(50)
	.refine((ids) => new Set(ids).size === ids.length);
const claimFields = { id, text, evidenceIds, kind: z.literal("fact") };
const claimSchema = z.union([z.strictObject(claimFields), z.strictObject({ ...claimFields, jobSpanIds: evidenceIds })]);
const fieldAddress = {
	sectionId: proposalTargetSchema.shape.sectionId,
	itemId: proposalTargetSchema.shape.itemId.unwrap().nullable(),
	roleId: proposalTargetSchema.shape.roleId.unwrap().nullable(),
	field: proposalTargetSchema.shape.field,
};
const orderSchema = z.strictObject({ sectionId: proposalTargetSchema.shape.sectionId, itemIds: z.array(id).max(100) });
const variantSchema = z.strictObject({
	resumeId: id,
	baseRevision: id,
	fields: z.array(z.strictObject({ ...fieldAddress, text: z.string().min(1).max(4000), evidenceIds })).max(50),
	order: z.array(orderSchema).max(50),
});
export type TailoringCase = TaskCase & { category: "tailoring"; variant: z.infer<typeof variantSchema> };
export const tailoringOutputSchema = z.strictObject({
	resumeId: id,
	baseRevision: id,
	patches: z
		.array(
			z.strictObject({
				id,
				target: z.strictObject({ resumeId: id, baseRevision: id, ...fieldAddress }),
				before: z.string().max(4000),
				after: text,
				why: text,
				evidenceIds,
				claims: z.array(claimSchema).min(1).max(100),
			}),
		)
		.max(50),
	order: z.array(orderSchema).max(50),
	notes: z.array(text).max(20),
});
export type TailoringOutput = z.infer<typeof tailoringOutputSchema>;
const policy = { lostFact: true, subsetEntities: true } as const;
const addressKey = (
	a: z.infer<typeof variantSchema>["fields"][number] | TailoringOutput["patches"][number]["target"],
) => JSON.stringify([a.sectionId, a.itemId, a.roleId, a.field]);
const unique = (ids: string[]) => new Set(ids).size === ids.length;
const editable = (a: { sectionId: string; itemId: string | null; roleId: string | null; field: string }) =>
	reviewTargetSchema.safeParse({
		sectionId: a.sectionId,
		field: a.field,
		...(a.itemId === null ? {} : { itemId: a.itemId }),
		...(a.roleId === null ? {} : { roleId: a.roleId }),
	}).success &&
	(a.sectionId !== "summary" || a.roleId === null);
const isContact = (section: string) => /^(?:contacts?|personal|basics)$/iu.test(section);
function context(c: TaskCase): TailoringCase["variant"] {
	if (c.category !== "tailoring" || !("variant" in c)) throw new Error("TAILORING_VARIANT_REQUIRED");
	const variant = variantSchema.parse(c.variant);
	if (!unique(c.cv.map((f) => f.id)) || c.jobAd?.segments.some((s) => c.cv.some((f) => f.id === s.id)))
		throw new Error("TAILORING_EVIDENCE_COLLISION");
	if (!unique(variant.fields.map(addressKey)) || !unique(variant.order.map((o) => o.sectionId)))
		throw new Error("TAILORING_DUPLICATE_TARGET");
	for (const order of variant.order) if (!unique(order.itemIds)) throw new Error("TAILORING_INVALID_ORDER");
	for (const field of variant.fields) {
		if (!editable(field) || field.evidenceIds.some((id) => !c.cv.some((f) => f.id === id && !isContact(f.section))))
			throw new Error("TAILORING_INVALID_TARGET");
		if (
			field.itemId !== null &&
			!variant.order.some((o) => o.sectionId === field.sectionId && o.itemIds.some((id) => id === field.itemId))
		)
			throw new Error("TAILORING_INVALID_TARGET");
	}
	return variant;
}
function names(c: TaskCase) {
	return [...new Set(c.cv.flatMap((f) => f.protected?.filter((p) => p.kind === "name").map((p) => p.text) ?? []))]
		.filter((s) => s.trim())
		.sort((a, b) => b.length - a.length || a.localeCompare(b));
}
/** Local restoration only; the lookup is never serialized into model input. */
function restoreTailoringNames(c: TaskCase, output: TailoringOutput): TailoringOutput {
	const entries = names(c);
	const restore = (s: string) => s.replace(/\[NAME_(\d+)\]/gu, (token, n: string) => entries[Number(n) - 1] ?? token);
	return {
		...output,
		patches: output.patches.map((p) => ({
			...p,
			before: restore(p.before),
			after: restore(p.after),
			why: restore(p.why),
			claims: p.claims.map((claim) => ({ ...claim, text: restore(claim.text) })),
		})),
		notes: output.notes.map(restore),
	};
}
function claims(c: TaskCase, output: TailoringOutput): Claim[] {
	return restoreTailoringNames(c, output).patches.flatMap((p) =>
		p.claims.map((claim) => ({ ...claim, id: `patch:${p.id}:${claim.id}` })),
	);
}
function buildInput(c: TaskCase) {
	const variant = context(c);
	const entries = names(c);
	const clean = (s: string) => entries.reduce((v, name, i) => v.replaceAll(name, `[NAME_${i + 1}]`), s);
	// Escape snapshot address strings before contact minimization, just like tasks-verifier structural ids.
	const structural = new Set([
		"resumeId",
		"baseRevision",
		"sectionId",
		"itemId",
		"roleId",
		"field",
		"evidenceIds",
		"itemIds",
	]);
	const serialize = (value: unknown): string => {
		const ids = new Set<string>();
		const visit = (v: unknown, key = ""): unknown => {
			if (typeof v === "string") {
				if (structural.has(key)) {
					ids.add(v);
					return v;
				}
				return clean(v);
			}
			if (Array.isArray(v)) return v.map((item) => visit(item, key));
			if (v && typeof v === "object")
				return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, visit(item, k)]));
			return v;
		};
		let json = JSON.stringify(visit(value));
		for (const id of ids)
			json = json.replaceAll(
				JSON.stringify(id),
				`"${id
					.split("")
					.map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`)
					.join("")}"`,
			);
		return json;
	};
	return buildModelPayload({
		selections: [
			...c.cv
				.filter((f) => !isContact(f.section))
				.map((f) => ({ id: f.id, kind: "confirmed_content" as const, section: f.section, text: clean(f.text) })),
			{ id: "tailoring-variant", kind: "user_supplied", section: "summary", text: serialize(variant) },
		],
		contactValues: [],
	});
}
function score(c: TaskCase, raw: TailoringOutput, verdict: unknown | null): TaskScore {
	const reasons: string[] = [];
	const unsupportedClaims: string[] = [];
	const lostFacts: string[] = [];
	const result = tailoringOutputSchema.safeParse(raw);
	let variant: TailoringCase["variant"] | null = null;
	try {
		variant = context(c);
	} catch {
		reasons.push("TAILORING_INVALID_CONTEXT");
	}
	if (!result.success || !variant)
		return {
			caseId: c.id,
			structuralFailure: true,
			missingQuestion: c.requiresQuestion,
			emptyAnswer: true,
			safetyDeterministic: { pass: false, reasons: [...reasons, "AI_INVALID_RESULT"] },
			quality: { metric: "targeted-change-coverage", value: null, pass: null },
			lostFacts,
			unsupportedClaims,
		};
	const out = restoreTailoringNames(c, result.data);
	if (out.resumeId !== variant.resumeId) reasons.push("TAILORING_WRONG_RESUME");
	if (out.baseRevision !== variant.baseRevision) reasons.push("TAILORING_STALE_REVISION");
	if (!unique(out.patches.map((p) => p.id)) || !unique(out.patches.map((p) => addressKey(p.target))))
		reasons.push("TAILORING_DUPLICATE_TARGET");
	for (const p of out.patches) {
		const field = variant.fields.find((f) => addressKey(f) === addressKey(p.target));
		if (p.target.resumeId !== variant.resumeId || !field || !editable(p.target))
			reasons.push("TAILORING_INVALID_TARGET");
		if (p.target.baseRevision !== variant.baseRevision) reasons.push("TAILORING_STALE_REVISION");
		if (field && p.before !== field.text) reasons.push("TAILORING_STALE_BEFORE");
		if (!claimsCoverText(p.after, p.claims)) reasons.push("TAILORING_UNCOVERED_TEXT");
		if (
			p.evidenceIds.some((id) => !c.cv.some((f) => f.id === id && !isContact(f.section))) ||
			p.claims.some((claim) => claim.evidenceIds.some((id) => !p.evidenceIds.includes(id)))
		)
			reasons.push("AI_INVALID_EVIDENCE");
		const checked = guardTaskClaims(c, p.claims, { ...policy, lostFact: false });
		if (!checked.pass) {
			reasons.push(...checked.details);
			unsupportedClaims.push(...p.claims.map((claim) => `patch:${p.id}:${claim.id}`));
		}
		// Retain the edited field, not unrelated CV facts that the job-specific variant did not edit.
		if (field) {
			const retained = guardTaskClaims(
				{ ...c, cv: [{ id: "edited-field", section: field.sectionId, text: field.text }] },
				p.claims.map((claim) => ({ ...claim, evidenceIds: ["edited-field"] })),
				policy,
			);
			if (!retained.pass) {
				reasons.push(...retained.details);
				lostFacts.push(p.id);
			}
		}
	}
	if (!unique(out.order.map((o) => o.sectionId))) reasons.push("TAILORING_INVALID_ORDER");
	for (const order of out.order) {
		const before = variant.order.find((o) => o.sectionId === order.sectionId);
		if (
			!before ||
			!unique(order.itemIds) ||
			before.itemIds.length !== order.itemIds.length ||
			order.itemIds.some((id) => !before.itemIds.includes(id))
		)
			reasons.push("TAILORING_INVALID_ORDER");
	}
	if (verdict !== null) {
		try {
			const parsed = tasksVerifierSchema.safeParse(verdict);
			if (!parsed.success || tasksVerifier.auditFault(c, raw, verdict)) reasons.push("TAILORING_INVALID_VERIFIER");
			else {
				for (const v of parsed.data.verdicts) if (v.verdict !== "supported") unsupportedClaims.push(v.claimId);
				if (!tasksVerifier.assess(c, raw, parsed.data).accepted) reasons.push("TAILORING_SEMANTIC_SAFETY");
				if (parsed.data.retention?.status !== "retained") lostFacts.push("verifier-retention");
			}
		} catch {
			reasons.push("TAILORING_INVALID_VERIFIER");
		}
	}
	const expected = tailoringOutputSchema.safeParse(c.gold);
	let quality: number | null = null;
	if (expected.success) {
		const wanted = expected.data;
		const total = wanted.patches.length + wanted.order.length;
		const matches =
			wanted.patches.filter((p) =>
				out.patches.some((o) => addressKey(o.target) === addressKey(p.target) && o.after !== o.before),
			).length +
			wanted.order.filter((o) =>
				out.order.some((x) => x.sectionId === o.sectionId && JSON.stringify(x.itemIds) === JSON.stringify(o.itemIds)),
			).length;
		quality = total ? matches / total : 1;
	}
	return {
		caseId: c.id,
		structuralFailure: false,
		missingQuestion: c.requiresQuestion,
		emptyAnswer: !out.patches.length && !out.order.length && !out.notes.length,
		safetyDeterministic: { pass: !reasons.length, reasons: [...new Set(reasons)] },
		quality: { metric: "targeted-change-coverage", value: quality, pass: quality === null ? null : quality === 1 },
		lostFacts,
		unsupportedClaims: [...new Set(unsupportedClaims)],
	};
}
/** Draft benchmark contract; no persistence, application or release approval. */
export const tailoringContract: TaskContract<TaskCase, TailoringOutput> = {
	category: "tailoring",
	promptVersion: "t006-tailoring-prompt-v2-cited-bridge",
	schemaVersion: "t006-tailoring-schema-v2",
	systemPrompt: readFileSync(new URL("./prompt.md", import.meta.url), "utf8"),
	outputSchema: tailoringOutputSchema,
	guardPolicy: policy,
	visibleCap: () => 4096,
	verifierCap: 12288,
	deadlineMs: 120_000,
	buildInput,
	claims,
	score,
	verifierContext: (c) => ({
		taskInstruction: `Check every proposed assertion using CV evidence only; job-only requirements never support candidate claims. For cover-letter and tailoring only, a non-assertive sentence may link cited CV facts to advertised duties when its separate jobSpanIds cite that duty wording and it asserts no new candidate fact, skill, metric or responsibility. Check the CV proposition using evidenceIds only and check the job reference against jobSpanIds; never merge the evidence pools. A bridge claiming a job-ad skill as the candidate's own, such as خبرتي في SAP المطلوبة في إعلانكم, is unsupported without CV evidence. Independently verify relational relevance; the deterministic bridge grammar does not prove semantic support. Independently inspect all after text, reasons and notes for uncovered assertions and responsibility/negation changes. Retain only edited fields; unrelated CV facts may stay outside the variant. Variant snapshot: ${JSON.stringify(context(c))}`,
		retention: "applicable",
		absenceChecks: [],
	}),
};
