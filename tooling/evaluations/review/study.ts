import type { BenchmarkArtifact, Calibration } from "./runner";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { HARD_FACTS_VERSION } from "@reactive-resume/api/features/ai/hard-facts";
import { PAYLOAD_VERSION } from "@reactive-resume/api/features/ai/payload";
import {
	VARIANT_VERIFIER_VERSION,
	variantVerifierPrompt,
	variantVerifierSchema,
} from "@reactive-resume/api/features/ai/variant-verifier";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { type TaskScope, type StudyName } from "./config";
import { loadModels, variantCases, type ModelConfig } from "./config";
import { loadTaskFixtures, taskReviewItems, type TaskReviewContext } from "./contracts/fixtures";
import { tasksGuardVersion } from "./contracts/guard";
import { getTaskContract } from "./contracts/index";
import { translationGlossary, translationGlossaryHash } from "./contracts/translation/contract";
import { type TaskCase } from "./contracts/types";
import { tasksVerifier, tasksVerifierVersion } from "./contracts/verifier/verifier";
import { cases, evaluateOutput, goldOutput, type BenchmarkCase } from "./corpus";
import {
	prepareCase as prepareExecutionCase,
	goldOutput as executionGoldOutput,
	evaluateOutput as evaluateExecutionOutput,
	type ExecutionCase,
} from "./execution";
import { frozenStudyFor } from "./freeze";
import { reviewVerifierPolicy } from "./production";
import { required } from "./required";
import { benchmarkVerifierSpec } from "./verifier";
import { systemicVerifierFault } from "./verifier-health";

const hash = (v: unknown): string => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const taskCategories = [
	"summary",
	"job-evidence",
	"tailoring",
	"translation",
	"cover-letter",
	"interview-prep",
] as const;
export function loadStudyCases(study: StudyName, scope: TaskScope = [...taskCategories]): ExecutionCase[] {
	return study === "core"
		? cases
		: loadTaskFixtures(
				scope.flatMap((c) =>
					["tuning", "holdout"].map((part) => new URL(`./contracts/${c}/${part}.json`, import.meta.url).pathname),
				),
			);
}
/** Canonical review context, shared by owner export and approval validation. No gold-dependent instruction. */
export function taskReviewContexts(scope: TaskScope = [...taskCategories]): TaskReviewContext[] {
	return scope.map((category) => {
		const contract = getTaskContract(category);
		return {
			category,
			task: `Complete the ${category} T007/T008 draft contract using confirmed CV facts only.`,
			systemPrompt: contract.systemPrompt,
			promptVersion: contract.promptVersion,
			schemaVersion: contract.schemaVersion,
			...(category === "translation" ? { glossary: translationGlossary } : {}),
		};
	});
}
export function studyReviewItems(study: StudyName, fixtures: ExecutionCase[]) {
	if (study === "core") return fixtures;
	if (fixtures.some((c) => c.kind !== "task")) throw new Error("STUDY_CASE_MISMATCH");
	return taskReviewItems(
		[
			...(fixtures as TaskCase[]),
			...loadTaskFixtures([new URL("./contracts/canaries.json", import.meta.url).pathname]).filter((c) =>
				fixtures.some((fixture) => fixture.category === c.category),
			),
		],
		taskReviewContexts(taskCategories.filter((category) => fixtures.some((fixture) => fixture.category === category))),
	);
}
export function taskStudyIdentity() {
	return {
		payloadVersion: PAYLOAD_VERSION,
		hardFactsVersion: HARD_FACTS_VERSION,
		tasksGuardVersion,
		tasksVerifierVersion,
		variantVerifierVersion: VARIANT_VERIFIER_VERSION,
		variantVerifierPromptHash: hash(variantVerifierPrompt),
		variantVerifierSchemaHash: hash(z.toJSONSchema(variantVerifierSchema)),
		glossaryHash: translationGlossaryHash,
		verifierPromptHash: hash(tasksVerifier.systemPrompt),
		verifierSchemaHash: hash(z.toJSONSchema(tasksVerifier.schema)),
		contracts: taskCategories.map((category) => {
			const c = getTaskContract(category);
			return {
				category,
				promptVersion: c.promptVersion,
				schemaVersion: c.schemaVersion,
				promptHash: hash(c.systemPrompt),
				schemaHash: hash(z.toJSONSchema(c.outputSchema)),
				guardPolicy: c.guardPolicy,
				visibleCaps: ["none", "low", "medium", "high"].map((effort) =>
					c.visibleCap(effort as "none" | "low" | "medium" | "high"),
				),
				verifierCap: c.verifierCap,
				deadlineMs: c.deadlineMs,
			};
		}),
	};
}
export const fixtureHash = (c: { id: string }) => hash(c);
export function caseVersions(cases: ExecutionCase[]) {
	return cases.map((c) => {
		const prepared = prepareExecutionCase(c);
		const handler = {
			...prepared.handler,
			verifier: "verifier" in prepared.handler ? prepared.handler.verifier : undefined,
		};
		const verifier = benchmarkVerifierSpec(c);
		return {
			caseId: c.id,
			fixtureHash: fixtureHash(c),
			benchmarkVerifierVersion: verifier.version,
			benchmarkVerifierPromptHash: hash(verifier.systemPrompt),
			benchmarkVerifierSchemaHash: hash(z.toJSONSchema(verifier.schema, { unrepresentable: "any" })),
			verifierPromptHash: hash(handler.verifier?.systemPrompt ?? null),
			verifierSchemaHash: hash(
				handler.verifier ? z.toJSONSchema(handler.verifier.output, { unrepresentable: "any" }) : null,
			),
			promptVersion: handler.promptVersion,
			promptHash: hash(handler.systemPrompt),
			schemaVersion: handler.schemaVersion,
			schemaHash: hash(z.toJSONSchema(handler.output, { unrepresentable: "any" })),
		};
	});
}
type ResumeSettings = {
	study?: StudyName;
	hash: string;
	mode: string;
	phase: string;
	budgetUsd: number;
	priorSpendMicros: number;
	openaiBudgetUsd?: number;
	priorOpenaiSpendMicros?: number;
	calibration: Calibration[];
};
export function validateResume(previous: ResumeSettings, current: ResumeSettings) {
	if ((previous.study ?? "core") !== (current.study ?? "core")) throw new Error("RESUME_MANIFEST_MISMATCH");
	for (const field of ["budgetUsd", "openaiBudgetUsd"] as const) {
		const before = previous[field] ?? 10;
		const after = current[field] ?? 10;
		if (!Number.isFinite(after) || after < before) throw new Error("RESUME_MANIFEST_MISMATCH");
	}
	for (const field of ["hash", "mode", "phase", "priorSpendMicros", "priorOpenaiSpendMicros", "calibration"] as const)
		if (hash(previous[field] ?? null) !== hash(current[field] ?? null)) throw new Error("RESUME_MANIFEST_MISMATCH");
}
export function smokeCases<T extends ExecutionCase>(
	cases: T[],
	models: ModelConfig[] = loadModels(),
	category?: "extraction" | "wording-extraction",
) {
	const scoped = category === "extraction" ? cases.filter((c) => c.category === category) : cases;
	return [...new Map(models.flatMap((m) => variantCases(m, scoped, "smoke", category)).map((c) => [c.id, c])).values()];
}
export function requireFullModels(models: ModelConfig[]) {
	if (!models.some((m) => m.model === "openai/gpt-6.1-terra" && m.provider === "openai"))
		throw new Error("TERRA_REQUIRED");
}
const approvalSchema = z.object({
	version: z.literal(1),
	reviewer: z.string().trim().min(1),
	reviewedAt: z.iso.datetime(),
	fixtures: z.array(
		z.object({ id: z.string(), hash: z.string(), sourceReviewed: z.literal(true), goldReviewed: z.literal(true) }),
	),
});
/** Keep each reviewer's dated, hash-bound contribution; coverage is scoped to the supplied study cases. */
export function arabicApprovalProvenance(raw: unknown, cases: readonly { id: string }[]) {
	const files = Array.isArray(raw) ? raw : [raw];
	const gated = cases.filter((c) => /\p{Script=Arabic}/u.test(JSON.stringify(c)));
	if (!files.length && gated.length) throw new Error("ARABIC_REVIEW_REQUIRED");
	const approvals = files.map((file) => {
		const result = approvalSchema.safeParse(file);
		if (!result.success) throw new Error("ARABIC_REVIEW_REQUIRED");
		if (new Set(result.data.fixtures.map((e) => e.id)).size !== result.data.fixtures.length)
			throw new Error("ARABIC_REVIEW_INCOMPLETE");
		return result.data;
	});
	const hashes = new Map<string, string>();
	for (const approval of approvals) {
		for (const entry of approval.fixtures) {
			if (hashes.has(entry.id) && hashes.get(entry.id) !== entry.hash) throw new Error("ARABIC_REVIEW_CONFLICT");
			hashes.set(entry.id, entry.hash);
		}
	}
	if (gated.some((c) => hashes.get(c.id) !== fixtureHash(c))) throw new Error("ARABIC_REVIEW_INCOMPLETE");
	return approvals
		.map(({ reviewer, reviewedAt, fixtures }) => ({
			reviewer,
			reviewedAt,
			fixtures: fixtures
				.filter((entry) => gated.some((c) => c.id === entry.id && fixtureHash(c) === entry.hash))
				.map(({ id, hash }) => ({ id, hash })),
		}))
		.filter((approval) => approval.fixtures.length);
}
/** Legacy single-file callers retain their string receipt and unchanged core fixture hashes. */
export function arabicApproval(raw: unknown, cases: readonly { id: string }[]): string {
	return [...new Set(arabicApprovalProvenance(raw, cases).map((approval) => approval.reviewer))].join("; ");
}
export function controls(cases: ExecutionCase[]) {
	const failures: { id: string; control: string; reason: string }[] = [];
	for (const c of cases.filter((c) => !c.exploratory)) {
		if (c.kind === "task") {
			for (const entry of [{ id: "gold", output: c.gold, expect: "honest" }, ...c.mutants]) {
				const deterministic = evaluateExecutionOutput(c, entry.output);
				let accepted = deterministic.schemaValid && deterministic.guardAccepted;
				if (accepted) {
					// Scripted label path only. Task 11 must measure independent judge canary recall.
					const output = getTaskContract(c.category).outputSchema.parse(entry.output) as Record<string, unknown>;
					const oracle = entry.expect === "honest" ? { ...c, gold: output } : c;
					accepted = evaluateExecutionOutput(c, output, tasksVerifier.fakeVerdict(oracle, output)).guardAccepted;
				}
				if (accepted !== (entry.expect === "honest"))
					failures.push({
						id: c.id,
						control: entry.id,
						reason: accepted ? "ATTACK_ACCEPTED" : (deterministic.guardError ?? "GOLD_LABEL_MISMATCH"),
					});
			}
			continue;
		}
		for (const safe of c.acceptableOutputs) {
			const output = goldOutput({ ...c, safeText: safe });
			const result = evaluateOutput(c, output);
			if (
				!result.schemaValid ||
				!result.guardAccepted ||
				result.usefulnessMiss ||
				result.missingQuestion ||
				result.score?.unsupportedClaims.length ||
				result.score?.lostFacts.length
			)
				failures.push({ id: c.id, control: "gold", reason: result.guardError ?? "GOLD_LABEL_MISMATCH" });
		}
		if (c.attack) {
			const output = goldOutput(c);
			if (c.kind === "wording")
				output.proposals = [
					{
						id: "p",
						passageId: "selected",
						text: c.attack,
						claims: splitReviewClaims(c.attack, ["selected"]),
						reason: "Synthetic adversarial control",
						evidenceIds: ["selected"],
					},
				];
			else
				output.candidates = [
					{
						id: "c",
						entityId: "synthetic-role",
						...c.extraction,
						value: { start: "2025-01", end: "2025-12", present: false },
						evidenceIds: ["selected"],
						confirmation: "needs_review",
					},
				];
			const result = evaluateOutput(c, output);
			if (result.guardAccepted) failures.push({ id: c.id, control: "attack", reason: "ATTACK_ACCEPTED" });
		}
	}
	return {
		checked: cases
			.filter((c) => !c.exploratory)
			.reduce(
				(n, c) =>
					n + (c.kind === "task" ? 1 + c.mutants.length : c.acceptableOutputs.length + Number(Boolean(c.attack))),
				0,
			),
		pass: failures.length === 0,
		failures,
		knownLimitations: [] as { id: string; reason: string }[],
		honestFalseRejects: cases
			.filter((c) => !c.holdout && !c.exploratory)
			.filter((c) => !evaluateExecutionOutput(c, executionGoldOutput(c)).guardAccepted)
			.map((c) => c.id),
	};
}
/** Reuse the final frozen scan; paid/report paths must not repeatedly inspect sealed quality. */
export function recordedControls(
	read: () => string = () =>
		readFileSync(
			new URL(study === "core" ? "./guard-controls-core.json" : "./guard-controls-tasks-v1.json", import.meta.url),
			"utf8",
		),
	study: StudyName = "core",
	scope?: TaskScope,
) {
	try {
		const receipt = JSON.parse(read()) as {
			freezeHash?: string;
			all?: ReturnType<typeof controls>;
			scoped?: { categories: string[]; result: ReturnType<typeof controls> };
		};
		const fullScope =
			scope?.length === taskCategories.length && taskCategories.every((category) => scope.includes(category));
		const result =
			scope && !fullScope
				? receipt.scoped && JSON.stringify(scope) === JSON.stringify(receipt.scoped.categories)
					? receipt.scoped.result
					: null
				: receipt.all;
		if (
			receipt.freezeHash !== hash(frozenStudyFor(study)) ||
			!result ||
			typeof result.pass !== "boolean" ||
			!Array.isArray(result.failures)
		)
			return null;
		const expected = loadStudyCases(study, scope)
			.filter((c) => !c.exploratory)
			.reduce(
				(n, c) =>
					n + (c.kind === "task" ? 1 + c.mutants.length : c.acceptableOutputs.length + Number(Boolean(c.attack))),
				0,
			);
		if (result.checked !== expected || result.pass !== (result.failures.length === 0)) return null;
		return result;
	} catch {
		return null;
	}
}
/** Deliberately useless scripted systems; never controls used to tune the production defence. */
export function baselineChecks(fixtures: BenchmarkCase[]) {
	return ["copy-input", "trivial-edit", "generic-question", "obedient-injection"].map((name) => {
		const selected = fixtures.filter(
			(c) =>
				c.kind === "wording" &&
				(name === "generic-question"
					? c.requiresQuestion
					: name === "obedient-injection"
						? c.category === "injection"
						: c.improvementExpected),
		);
		const escaped = selected
			.filter((c) => {
				const output = goldOutput({
					...c,
					safeText: name === "copy-input" ? c.input : name === "trivial-edit" ? c.input + "!" : (c.attack ?? c.input),
				});
				if (name === "generic-question")
					output.questions = [{ id: "q", passageId: "selected", prompt: "Hello?", evidenceIds: ["selected"] }];
				const result = evaluateOutput(c, output);
				return (
					result.schemaValid &&
					result.guardAccepted &&
					!result.emptyAnswer &&
					!result.usefulnessMiss &&
					!result.missingQuestion &&
					!result.score?.unsupportedClaims.length &&
					!result.score?.lostFacts.length
				);
			})
			.map((c) => c.id);
		return {
			name,
			checked: selected.length,
			accepted: escaped.length,
			escaped,
			pass: selected.length > 0 && escaped.length === 0,
		};
	});
}
export function studyHash(
	models: ModelConfig[],
	cases: ExecutionCase[],
	runs: number,
	smokeCategory?: "extraction" | "wording-extraction",
	study: StudyName = "core",
) {
	return hash({
		...(study === "tasks-v1" ? { study, identity: taskStudyIdentity() } : {}),
		...(smokeCategory ? { smokeCategory } : {}),
		payloadVersion: PAYLOAD_VERSION,
		freeze: frozenStudyFor(study),
		models: models.map(({ model, provider, providerEndpoint, reasoning, categories, sets }) => ({
			model,
			provider,
			providerEndpoint,
			reasoning,
			categories,
			sets,
		})),
		runs,
		fixtures: cases.map((c) => ({
			fixture: fixtureHash(c),
			prompt: prepareExecutionCase(c).handler.promptVersion,
			schema: hash(z.toJSONSchema(prepareExecutionCase(c).handler.output, { unrepresentable: "any" })),
			system: hash(prepareExecutionCase(c).handler.systemPrompt),
		})),
	});
}
/** OpenRouter returns display names in some responses. Only reviewed exact aliases resolve. */
export const returnedProvider = (name: string | null): string | null =>
	({
		Azure: "azure",
		OpenAI: "openai",
		Together: "together",
		"Together AI": "together",
		"Google Vertex": "google-vertex",
		Google: "google-vertex",
	})[name ?? ""] ?? name;
export function validateSmoke(
	artifact: BenchmarkArtifact,
	models: ModelConfig[],
	cases: ExecutionCase[],
	study: StudyName = "core",
) {
	const variants = assessSmoke(artifact, models, cases, study);
	const failed = variants.filter((v) => v.status !== "accepted");
	if (failed.length)
		throw new Error(
			`SMOKE_VARIANT_FAILED: ${failed.map((v) => `${v.model}@${v.reasoning}/${v.provider}: ${v.reason}`).join("; ")}`,
		);
	// Missing measured pairs retain catalog reservations; never fabricate calibration.
	return variants.flatMap((v) => (v.calibration ? [v.calibration] : []));
}
export type SmokeVariant = {
	writerErrors?: { schema: number; truncated: number; other: number };
	verifierFaults?: number;
	model: string;
	provider: string;
	reasoning: string;
	status: "accepted" | "unsupported" | "writer-failed" | "transient-provider-failed";
	reason: string | null;
	calibration: import("./runner").Calibration | null;
};
export function assessSmoke(
	artifact: BenchmarkArtifact,
	models: ModelConfig[],
	cases: ExecutionCase[],
	study: StudyName = "core",
): SmokeVariant[] {
	if ((artifact.study?.name ?? "core") !== study) throw new Error("LIVE_SMOKE_MISMATCH");
	if (artifact.stopReason) throw new Error("SMOKE_INCOMPLETE");
	if (systemicVerifierFault(artifact.calls)) throw new Error("SMOKE_VERIFIER_SYSTEMIC");
	if (
		artifact.calls.some(
			(c) =>
				!models.some((m) => m.model === c.model && m.provider === c.provider && m.reasoning === c.reasoning) ||
				!cases.some((f) => f.id === c.caseId) ||
				c.runIndex !== 0,
		)
	)
		throw new Error("SMOKE_INCOMPLETE");
	return models.map((m) => {
		const fail = (reason: string): never => {
			throw new Error(`SMOKE_VARIANT_FAILED: ${m.model}@${m.reasoning}/${m.provider}: ${reason}`);
		};
		const expected = variantCases(m, cases, "smoke", artifact.study?.smokeCategory);
		const calls = artifact.calls.filter(
			(c) => c.model === m.model && c.reasoning === m.reasoning && c.provider === m.provider,
		);
		if (
			calls.some(
				(c) =>
					returnedProvider(c.actualProvider) !== m.provider &&
					!(c.actualProvider === null && (c.outcome === "transient" || (c.outcome !== "valid" && c.costMicros === 0))),
			)
		)
			fail("PROVIDER_MISMATCH");
		const identity = { model: m.model, provider: m.provider, reasoning: m.reasoning };
		if (calls.some((c) => c.outcome === "unsupported")) {
			if (calls.some((c) => c.costMicros === null || c.costMicros > c.reservedMicros))
				fail("INVALID_BILLING_OR_VERIFIER_OR_SCHEMA");
			return { ...identity, status: "unsupported", reason: "PINNED_PROVIDER_REJECTED_VARIANT", calibration: null };
		}
		if (calls.length !== expected.length || expected.some((c) => !calls.some((r) => r.caseId === c.id)))
			fail("MISSING_CASE_CATEGORY_OR_LANGUAGE");
		// Smoke validates paid plumbing. Writer quality/failures remain measured data.
		if (calls.some((c) => c.costMicros === null || c.costMicros > c.reservedMicros)) fail("INVALID_BILLING");
		if (calls.some((c) => ["ACCOUNT_ERROR", "PAYER_MISMATCH", "REQUEST_SCHEMA_ERROR"].includes(c.outcome)))
			fail("INFRASTRUCTURE_FAILURE");
		if (calls.some((c) => c.outcome === "transient"))
			return {
				...identity,
				status: "transient-provider-failed",
				reason: "TRANSIENT_PROVIDER_FAILURE",
				calibration: null,
			};
		const successful = calls.filter(
			(c) =>
				c.outcome === "valid" && c.schemaValid && !c.writerProvenanceRejected && !(c.writerTruncated ?? c.truncated),
		);
		if (successful.some((c) => !c.verifierUsage)) fail("VERIFIER_UNAVAILABLE");
		if (
			calls.some(
				(c) =>
					c.verifierUsage &&
					(c.verifierUsage.model !== reviewVerifierPolicy(m.model).model ||
						returnedProvider(c.verifierUsage.provider) !== reviewVerifierPolicy(m.model).downstreamProvider ||
						c.verifierUsage.reasoning !== "low"),
			)
		)
			fail("PROVIDER_MISMATCH");
		if (
			successful.some(
				(c) =>
					!c.verifierFault &&
					!c.verifierTruncated &&
					(c.factRetention == null ||
						!c.verifierUsage ||
						c.verifierUsage.inputTokens <= 0 ||
						c.verifierUsage.outputTokens <= 0),
			)
		)
			fail("VERIFIER_UNAVAILABLE");
		const completePair = successful.some((c) => c.verifierUsage && !c.verifierFault && !c.verifierTruncated);
		if (
			calls.some(
				(c) =>
					c.inputTokens === null ||
					c.outputTokens === null ||
					c.inputTokens < 0 ||
					c.outputTokens < 0 ||
					c.inputTokens > c.inputTokenCap ||
					c.outputTokens > c.outputTokenCap,
			)
		)
			fail("INVALID_USAGE");
		const writerErrors = {
			schema: calls.filter((c) => !c.schemaValid && !(c.writerTruncated ?? c.truncated) && c.outcome === "invalid")
				.length,
			truncated: calls.filter((c) => c.writerTruncated ?? c.truncated).length,
			other: calls.filter(
				(c) =>
					c.writerProvenanceRejected ||
					(c.outcome !== "valid" && c.outcome !== "invalid" && !(c.writerTruncated ?? c.truncated)),
			).length,
		};

		return {
			...identity,
			status: "accepted",
			writerErrors,
			verifierFaults: calls.filter((c) => c.verifierFault || c.verifierTruncated).length,
			reason: null,
			calibration: completePair
				? {
						model: m.model,
						provider: m.provider,
						reasoning: m.reasoning,
						inputTokens: Math.max(...calls.map((c) => required(c.inputTokens))),
						outputTokens: Math.max(...calls.map((c) => required(c.outputTokens))),
						samples: calls.length,
						pairOpenRouterCostMicros: Math.max(...calls.map((c) => c.openRouterCostMicros ?? required(c.costMicros))),
						pairOpenaiCostMicros: Math.max(...calls.map((c) => c.openaiCostMicros ?? 0)),
						pairCostMicros: Math.max(...calls.map((c) => required(c.costMicros))),
						referenceInputTokens: Math.max(
							...calls.map((c) => c.generationUsage?.inputTokens ?? required(c.inputTokens)),
						),
						generationInputTokens: Math.max(...calls.map((c) => c.generationUsage?.inputTokens ?? 0)),
						generationOutputTokens: Math.max(...calls.map((c) => c.generationUsage?.outputTokens ?? 0)),
						verifierInputTokens: Math.max(...calls.map((c) => c.verifierUsage?.inputTokens ?? 0)),
						verifierOutputTokens: Math.max(...calls.map((c) => c.verifierUsage?.outputTokens ?? 0)),
					}
				: null,
		};
	});
}
