import type { TaskVerifierAdapter } from "../runtime";
import type { Claim, TaskCase } from "../types";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { normalizeFact } from "@reactive-resume/api/features/ai/hard-facts";
import { buildModelPayload } from "../../production";
import { taskContractFor } from "../runtime";
import { tasksVerifierSchema, type TasksVerification } from "./schema";

export const tasksVerifierVersion = "t006-tasks-verifier-v2-exact-ids";
const systemPrompt = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const identifierKeys = new Set([
	"id",
	"evidenceIds",
	"sourceId",
	"sectionId",
	"itemId",
	"spanIds",
	"cvEvidenceIds",
	"jobSpanIds",
]);

/** Escape only structural identifiers so repeated contact minimization cannot rewrite numeric IDs. */
function serialize(value: unknown): string {
	const ids = new Set<string>();
	const collect = (input: unknown, key = "") => {
		if (typeof input === "string" && identifierKeys.has(key)) ids.add(input);
		else if (Array.isArray(input)) for (const item of input) collect(item, key);
		else if (input && typeof input === "object") for (const [k, v] of Object.entries(input)) collect(v, k);
	};
	collect(value);
	let json = JSON.stringify(value);
	for (const id of ids) {
		const escaped = id
			.split("")
			.map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)
			.join("");
		json = json.replaceAll(JSON.stringify(id), `"${escaped}"`);
	}
	return json;
}

function verification(c: TaskCase, raw: Record<string, unknown>) {
	const contract = taskContractFor(c);
	const output = contract.outputSchema.parse(raw);
	const claims = contract.claims(c, output);
	const context = contract.verifierContext(c, output);
	const sources = new Set(c.cv.map((f) => f.id));
	if (sources.size !== c.cv.length || c.jobAd?.segments.some((s) => sources.has(s.id)))
		throw new Error("TASK_EVIDENCE_ID_COLLISION");
	const unique = (ids: string[]) => ids.every((id) => id.trim().length > 0) && new Set(ids).size === ids.length;
	if (!unique(claims.map((claim) => claim.id)) || !unique(context.absenceChecks.map((check) => check.id)))
		throw new Error("TASK_DUPLICATE_VERIFICATION_ID");
	if (claims.some((claim) => claim.evidenceIds.some((id) => !sources.has(id))))
		throw new Error("TASK_UNKNOWN_EVIDENCE");
	const questions = raw.questions ?? [];
	if (!Array.isArray(questions)) throw new Error("TASK_INVALID_QUESTION");
	const premises = questions.map((q: unknown) => {
		if (!q || typeof q !== "object" || !("id" in q) || typeof q.id !== "string" || !q.id.trim())
			throw new Error("TASK_INVALID_QUESTION");
		const text = "text" in q ? q.text : "prompt" in q ? q.prompt : null;
		if (typeof text !== "string" || !text.trim()) throw new Error("TASK_INVALID_QUESTION");
		return { id: `question:${q.id}`, text };
	});
	if (!unique(premises.map((p) => p.id))) throw new Error("TASK_DUPLICATE_VERIFICATION_ID");
	return { claims, context, sources, premises };
}

/** Redact text before JSON serialization: URLs/emails must not swallow JSON delimiters or stable IDs. */
function sanitizer(c: TaskCase) {
	const names = [
		...new Set(c.cv.flatMap((f) => f.protected?.filter((p) => p.kind === "name").map((p) => p.text) ?? [])),
	]
		.filter((name) => name.trim())
		.sort((a, b) => b.length - a.length || a.localeCompare(b));
	const text = (value: string) => {
		let result = value;
		for (const [i, name] of names.entries()) result = result.replaceAll(name, `[NAME_${i + 1}]`);
		if (!result.trim()) return "";
		return (
			buildModelPayload({
				selections: [{ id: "sanitize", kind: "model_proposed", section: "summary", text: result }],
				contactValues: [],
			}).selections[0]?.text ?? ""
		);
	};
	const value = (input: unknown, key = ""): unknown => {
		if (typeof input === "string") return identifierKeys.has(key) ? input : text(input);
		if (Array.isArray(input)) return input.map((item) => value(item, key));
		if (input && typeof input === "object")
			return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, value(v, k)]));
		return input;
	};
	return { text, value };
}

function buildInput(c: TaskCase, output: Record<string, unknown>) {
	const { claims, context, premises } = verification(c, output);
	if (c.cv.length + (c.jobAd?.segments.length ?? 0) > 50) throw new Error("TASK_SELECTION_LIMIT");
	const clean = sanitizer(c);
	// Four explicit pools avoid dropping CV facts to make room for verifier metadata.
	return buildModelPayload({
		selections: [
			{
				id: "task-cv-evidence",
				kind: "confirmed_content",
				section: "summary",
				text: serialize(c.cv.map((f) => ({ id: f.id, section: f.section, text: clean.text(f.text) }))),
			},
			{
				id: "task-job-context",
				kind: "user_supplied",
				section: "summary",
				text: serialize({
					trust: "untrusted",
					segments: c.jobAd?.segments.map((s) => ({ id: s.id, text: clean.text(s.text) })) ?? [],
				}),
			},
			{
				id: "task-verification-task",
				kind: "model_proposed",
				section: "summary",
				text: serialize({
					version: tasksVerifierVersion,
					category: c.category,
					...(clean.value(context) as object),
				}),
			},
			{
				id: "task-verification-response",
				kind: "model_proposed",
				section: "summary",
				text: serialize({
					response: clean.value(output),
					claims: clean.value(claims),
					premiseChecks: clean.value(premises),
				}),
			},
		],
		contactValues: [],
	});
}

const sameIds = (expected: string[], actual: string[]) =>
	expected.length === actual.length &&
	new Set(actual).size === actual.length &&
	actual.every((id) => expected.includes(id));
const quoteText = (text: string) =>
	normalizeFact(text)
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

function auditFault(c: TaskCase, output: Record<string, unknown>, raw: unknown): string | null {
	const parsed = tasksVerifierSchema.safeParse(raw);
	if (!parsed.success) return "INVALID_VERIFIER_OUTPUT";
	const verdict = parsed.data;
	const { claims, context, sources, premises } = verification(c, output);
	if ((context.retention === "applicable") !== (verdict.retention !== null)) return "VERIFIER_RETENTION_SCOPE";
	if (
		!sameIds(
			claims.map((claim) => claim.id),
			verdict.verdicts.map((v) => v.claimId),
		)
	)
		return "VERIFIER_UNKNOWN_CLAIM";
	if (
		!sameIds(
			context.absenceChecks.map((check) => check.id),
			verdict.absence.map((check) => check.id),
		)
	)
		return "VERIFIER_UNKNOWN_ABSENCE";
	if (
		!sameIds(
			premises.map((p) => p.id),
			verdict.premises.map((p) => p.id),
		)
	)
		return "VERIFIER_UNKNOWN_PREMISE";
	if (
		[...(verdict.retention?.evidenceIds ?? []), ...verdict.verdicts.flatMap((v) => v.evidenceIds)].some(
			(id) => !sources.has(id),
		)
	)
		return "VERIFIER_UNKNOWN_EVIDENCE";
	if (
		verdict.verdicts.some((v) =>
			v.evidenceIds.some((id) => !claims.find((claim) => claim.id === v.claimId)?.evidenceIds.includes(id)),
		)
	)
		return "VERIFIER_UNCITED_EVIDENCE";
	const input = quoteText(
		buildInput(c, output)
			.selections.map((s) => JSON.stringify(JSON.parse(s.text)))
			.join("\n"),
	);
	for (const reason of [
		verdict.quality.reason,
		verdict.coverage.reason,
		verdict.retention?.reason ?? "",
		...verdict.verdicts.map((v) => v.reason),
		...verdict.premises.map((p) => p.reason),
	])
		for (const match of reason.matchAll(/(?<!\p{L})["“'«]([^"”'»\n]{4,})["”'»]/gu))
			if (!input.includes(quoteText(match[1] ?? ""))) return "VERIFIER_UNSUPPLIED_QUOTE";
	return null;
}

function assess(c: TaskCase, output: Record<string, unknown>, raw: Record<string, unknown>) {
	const fault = auditFault(c, output, raw);
	if (fault) throw new Error(fault);
	const verdict = tasksVerifierSchema.parse(raw);
	return {
		accepted:
			verdict.verdicts.every((v) => v.verdict === "supported") &&
			(!verdict.retention || verdict.retention.status === "retained") &&
			verdict.absence.every((check) => check.verdict === "confirmed_absent") &&
			verdict.coverage.status === "complete" &&
			verdict.premises.every((p) => ["supported", "no_candidate_premise"].includes(p.verdict)),
		qualityAccepted: ["appropriate", "no_change_needed"].includes(verdict.quality.status),
		responseAssessment: verdict.quality,
		retention: verdict.retention?.status ?? ("not_applicable" as const),
		assessment: verdict.quality.status,
		usefulness: null,
	};
}

/** Scripted oracle only. Equality to a synthetic gold output is never measured semantic evidence. */
function fakeVerdict(c: TaskCase, output: Record<string, unknown>): TasksVerification {
	const { claims, context, premises } = verification(c, output);
	const gold = isDeepStrictEqual(output, c.gold);
	const reason = "Scripted fixture oracle only; not measured semantic evidence.";
	return {
		schemaVersion: 1,
		verdicts: claims.map((claim: Claim) => ({
			claimId: claim.id,
			verdict: gold ? "supported" : "unsupported",
			evidenceIds: claim.evidenceIds,
			reason,
		})),
		retention:
			context.retention === "applicable"
				? { status: gold ? "retained" : "unclear", evidenceIds: c.cv.map((f) => f.id), reason }
				: null,
		absence: context.absenceChecks.map((check) => ({ id: check.id, verdict: gold ? "confirmed_absent" : "unclear" })),
		coverage: { status: gold ? "complete" : "unclear", reason },
		premises: premises.map((p) => ({ id: p.id, verdict: gold ? "no_candidate_premise" : "unclear", reason })),
		quality: { status: gold ? "appropriate" : "unclear", reason },
	};
}

export const tasksVerifier: TaskVerifierAdapter = {
	version: tasksVerifierVersion,
	systemPrompt,
	schema: tasksVerifierSchema,
	buildInput,
	fakeVerdict,
	auditFault,
	assess,
};
