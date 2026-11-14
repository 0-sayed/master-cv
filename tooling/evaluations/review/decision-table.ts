import type { TaskCategory, TaskScore } from "./contracts/types";
import type { DecisionCandidate, DecisionEvidence, OwnerRating, DecisionRow } from "./decision";
import type { BenchmarkArtifact, BenchmarkCall } from "./runner";
import { createHash } from "node:crypto";
import { z } from "zod";
import { blindCalls } from "./blind";
import { getTaskContract } from "./contracts";
import { decideEvidence, qualityPolicies, SAFETY_CI_THRESHOLD } from "./decision";
import { caseClusteredSafety, safetyPass } from "./metrics";
import { reviewHandlers } from "./production";

export type { OwnerRating, DecisionRow } from "./decision";
const languages = ["ar", "en", "mixed"] as const;
const coreCategories = new Set(["wording", "extraction", "missing-info", "injection"]);
const variantKey = (c: { model: string; reasoning: string }) => JSON.stringify([c.model, c.reasoning]);
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/** A count alone is insufficient: duplicate slots or a missing variant/case/repeat must fail closed. */
export function artifactComplete(a: BenchmarkArtifact): boolean {
	if (
		a.stopReason ||
		a.incomplete?.length ||
		a.modelStops.length ||
		a.calls.length !== a.estimate.calls ||
		!a.calls.length
	)
		return false;
	const slots = new Set<string>();
	const expected = new Map<string, Set<string>>();
	for (const c of a.calls) {
		const variant = JSON.stringify([c.model, c.provider, c.reasoning]);
		const slot = JSON.stringify([c.caseId, c.runIndex]);
		const key = JSON.stringify([variant, slot]);
		if (slots.has(key)) return false;
		slots.add(key);
		// Exploratory cases can legitimately use a different grid.
		if (!c.exploratory) {
			const group = expected.get(variant) ?? new Set<string>();
			group.add(slot);
			expected.set(variant, group);
		}
	}
	const groups = [...expected.values()];
	const union = new Set(groups.flatMap((g) => [...g]));
	return groups.length > 0 && groups.every((g) => g.size === union.size);
}

function quality(c: BenchmarkCall, metric: string): number | null {
	if (!coreCategories.has(c.category)) {
		const score = (c as BenchmarkCall & { taskScore?: TaskScore }).taskScore;
		return score?.quality.metric === metric && score.quality.value !== null && Number.isFinite(score.quality.value)
			? score.quality.value
			: null;
	}
	return c.qualityAccepted === undefined || c.qualityAccepted === null ? null : Number(c.qualityAccepted);
}

/** Server-side extraction: the schema hash is the actual JSON schema, never a version-label hash. */
export function buildDecisionEvidence(a: BenchmarkArtifact, study: "core" | "tasks-v1"): DecisionEvidence[] {
	const held = a.calls.filter((c) => c.holdout && !c.exploratory);
	const blind = blindCalls(a, () => 0);
	const outputFor = new Map<string, string>();
	for (const [id, identity] of Object.entries(blind.identities)) {
		if (identity.repeatOf) continue;
		for (const member of identity.members ?? [identity])
			outputFor.set(JSON.stringify([identity.groupId, member.model, member.reasoning]), id);
	}
	return [...new Set(held.map((c) => c.category))]
		.filter((category) => (study === "core" ? coreCategories.has(category) : !coreCategories.has(category)))
		.map((category) => {
			const rows = held.filter((c) => c.category === category);
			const policy = qualityPolicies[category] ?? {
				metric: "verifier-response-quality",
				band: 0.05,
				direction: "higher" as const,
			};
			const handler =
				study === "tasks-v1"
					? getTaskContract(category as TaskCategory)
					: reviewHandlers[category === "extraction" ? "review.extraction" : "review.wording"];
			const schema = "outputSchema" in handler ? handler.outputSchema : handler.output;
			const schemaHash = createHash("sha256")
				.update(JSON.stringify(z.toJSONSchema(schema)))
				.digest("hex");
			const candidates: DecisionCandidate[] = [...new Set(rows.map(variantKey))].map((key) => {
				const calls = rows.filter((c) => variantKey(c) === key);
				const first = calls[0];
				if (!first) throw new Error("DECISION_EMPTY_VARIANT");
				const issues: string[] = [];
				if (calls.some((c) => c.promptVersion !== handler.promptVersion || c.schemaVersion !== handler.schemaVersion))
					issues.push("contract version changed");
				if (
					calls.some(
						(c) =>
							c.outcome !== "valid" ||
							c.verifierFault ||
							c.adjudication === "verifier-fault" ||
							!c.schemaValid ||
							c.truncated ||
							c.writerTruncated,
					)
				)
					issues.push("fault or invalid output");
				if (
					calls.some(
						(c) =>
							c.costMicros === null ||
							!Number.isFinite(c.costMicros) ||
							c.costMicros < 0 ||
							!Number.isFinite(c.latencyMs) ||
							c.latencyMs < 0,
					)
				)
					issues.push("unknown cost or latency");
				const perLanguage = Object.fromEntries(
					languages.map((language) => {
						const slice = calls.filter((c) => c.language === language);
						// Repetitions cannot change a case's weight in the quality mean.
						const caseValues = [...new Set(slice.map((c) => c.caseId))].map((id) => {
							const values = slice.filter((c) => c.caseId === id).map((c) => quality(c, policy.metric));
							return values.some((v) => v === null) ? null : mean(values as number[]);
						});
						const stats = caseClusteredSafety(slice);
						return [
							language,
							{ ...stats, quality: caseValues.some((v) => v === null) ? null : mean(caseValues as number[]) },
						];
					}),
				) as DecisionCandidate["perLanguage"];
				const observedSafe =
					issues.length === 0 && languages.every((l) => perLanguage[l].n > 0 && perLanguage[l].safetyRate === 1);
				const times = calls.map((c) => c.latencyMs).sort((a, b) => a - b);
				const percentile = (p: number) => times[Math.max(0, Math.ceil(times.length * p) - 1)] ?? null;
				return {
					model: first.model,
					reasoning: first.reasoning,
					perLanguage,
					observedSafe,
					qualified: observedSafe && languages.every((l) => perLanguage[l].ci95[0] >= SAFETY_CI_THRESHOLD),
					issues,
					costPer1000Usd: calls.every((c) => c.costMicros !== null)
						? (mean(calls.map((c) => c.costMicros ?? 0)) ?? 0) / 1000
						: null,
					p50Ms: percentile(0.5),
					p95Ms: percentile(0.95),
					promptVersion: first.promptVersion,
					schemaHash,
					outputs: calls.map((c) => ({
						reportId: a.id,
						outputId: outputFor.get(JSON.stringify([`sample-${c.caseId}-${c.runIndex}`, c.model, c.reasoning])) ?? "",
						language: c.language,
					})),
				};
			});
			return {
				category,
				qualityPolicy: policy,
				candidates,
				blocked:
					a.mode !== "live"
						? "FAKE evidence never qualifies a model."
						: !artifactComplete(a)
							? "Incomplete or duplicate benchmark evidence."
							: a.study &&
								  (a.study.phase !== "full" || !a.study.controls.pass || (a.study.name && a.study.name !== study))
								? "Full study and passing controls required."
								: null,
			};
		});
}

/** Injection fabrication failures apply to every category for the matching model/effort. */
export function mergeDecisionEvidence(core: BenchmarkArtifact, tasks: BenchmarkArtifact): DecisionEvidence[] {
	const failures = new Set(
		core.calls
			.filter(
				(c) =>
					c.holdout &&
					!c.exploratory &&
					c.category === "injection" &&
					((c.guardAccepted && c.verifierAccepted && (c.score?.unsupportedClaims.length ?? 0) > 0) || !safetyPass(c)),
			)
			.map(variantKey),
	);
	return [...buildDecisionEvidence(core, "core"), ...buildDecisionEvidence(tasks, "tasks-v1")].map((e) => ({
		...e,
		candidates: e.candidates.map((c) =>
			failures.has(variantKey(c))
				? { ...c, qualified: false, observedSafe: false, issues: [...c.issues, "core injection safety failure"] }
				: c,
		),
	}));
}
export function buildDecisionTable(input: {
	core: BenchmarkArtifact;
	tasks: BenchmarkArtifact;
	ratings: OwnerRating[];
}): DecisionRow[] {
	return decideEvidence(mergeDecisionEvidence(input.core, input.tasks), input.ratings);
}
