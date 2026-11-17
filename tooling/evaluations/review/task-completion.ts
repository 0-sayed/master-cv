import type { TaskCase } from "./contracts/types";
import type { BenchmarkArtifact, BenchmarkCall } from "./runner";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { getTaskContract } from "./contracts";
import { replayTaskGuards } from "./guard-replay";
import { required } from "./required";

export const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const slot = (c: { model: string; provider: string; reasoning: string; caseId: string; runIndex: number }) =>
	JSON.stringify([c.model, c.provider, c.reasoning, c.caseId, c.runIndex]);
export function completionKeys(a: BenchmarkArtifact): string[] {
	if (new Set(a.calls.map((c) => c.key)).size !== a.calls.length) throw new Error("DUPLICATE_SOURCE_KEY");
	return (a.incomplete ?? [])
		.map((s) => {
			const c = a.calls.find((c) => slot(c) === slot(s));
			if (!c || c.category !== "translation") throw new Error("UNEXPECTED_INCOMPLETE_SLOT");
			return c.key;
		})
		.sort();
}

/** Unfinished attempts remain immutable history, not committed completion records. */
export function translationSeed(source: BenchmarkArtifact) {
	const unfinished = new Set(completionKeys(source));
	return {
		previousCalls: source.calls.filter((c) => c.category === "translation" && !unfinished.has(c.key)),
		heldExposureMicros: source.calls
			.filter((c) => unfinished.has(c.key))
			.reduce((n, c) => n + (c.unknownExposureMicros ?? c.reservedOpenRouterMicros ?? c.reservedMicros ?? 0), 0),
	};
}

export function mergeCompletion(
	source: BenchmarkArtifact,
	translation: BenchmarkArtifact,
	cover: BenchmarkArtifact,
	fixture = false,
) {
	if (source.mode !== "live" || [translation, cover].some((a) => a.mode !== (fixture ? "fake" : "live")))
		throw new Error("LIVE_EVIDENCE_REQUIRED");
	if (new Set(translation.calls.map((c) => c.key)).size !== translation.calls.length)
		throw new Error("DUPLICATE_COMPLETION_KEY");
	const allowed = new Set(completionKeys(source));
	const merged = new Map(source.calls.map((c) => [c.key, c]));
	for (const c of translation.calls) {
		const before = merged.get(c.key);
		if (!before || c.category !== "translation") throw new Error("UNEXPECTED_TRANSLATION_SLOT");
		if (!allowed.has(c.key)) {
			if (!isDeepStrictEqual(before, c)) throw new Error("FINISHED_CALL_CHANGED");
			continue;
		}
		if (
			["outputDigest", "fixtureHash", "promptDigest", "inputDigest", "sourceDigest"].some(
				(k) => before[k as keyof BenchmarkCall] !== c[k as keyof BenchmarkCall],
			)
		)
			throw new Error("WRITER_CHANGED");
		merged.set(c.key, c);
	}
	for (const key of allowed) if (!translation.calls.some((c) => c.key === key)) throw new Error("MISSING_COMPLETION");
	for (const c of cover.calls) {
		if (c.category !== "cover-letter" || merged.has(c.key)) throw new Error("UNEXPECTED_OR_DUPLICATE_LETTER");
		merged.set(c.key, c);
	}
	return [...merged.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function repairGuards(cases: TaskCase[], calls: BenchmarkCall[]): BenchmarkCall[] {
	const replay = replayTaskGuards(cases, calls);
	const rows = new Map(replay.sessions.map((s) => [s.key, s]));
	return calls.map((c) => {
		const r = required(rows.get(c.key));
		const fixture = required(cases.find((f) => f.id === c.caseId));
		const contract = getTaskContract(fixture.category);
		let output: unknown = c.output;
		try {
			output = JSON.parse(c.output);
		} catch {
			/* Invalid writer bytes remain invalid. */
		}
		const parsed = contract.outputSchema.safeParse(output);
		const taskScore = parsed.success ? contract.score(fixture, parsed.data, c.verifierVerdict ?? null) : c.taskScore;
		return {
			...c,
			guardAccepted: r.guardAccepted,
			guardError: r.guardError,
			verifierAccepted: r.semanticAccepted,
			safetyAccepted: r.accepted,
			...(taskScore ? { taskScore } : {}),
			adjudication: c.verifierFault
				? ("verifier-fault" as const)
				: r.semanticAccepted
					? ("verifier" as const)
					: ("pending-human" as const),
			...(c.score
				? {
						score: {
							...c.score,
							unsupportedClaims: taskScore?.unsupportedClaims ?? c.score.unsupportedClaims,
							lostFacts: taskScore?.lostFacts ?? c.score.lostFacts,
						},
					}
				: {}),
		};
	});
}

export function estimateCompletion(calls: BenchmarkCall[], sessions: number, verifierOnly: boolean) {
	const measured = calls.filter(
		(c) => c.openRouterCostMicros !== null && c.openaiCostMicros !== null && c.outcome === "valid",
	);
	if (!measured.length) throw new Error("NO_MEASURED_COST");
	const scale = sessions / measured.length;
	const judgeMs = measured.reduce((n, c) => n + (c.verifierJudgments ?? []).reduce((m, j) => m + j.latencyMs, 0), 0);
	const totalMs = measured.reduce((n, c) => n + c.latencyMs, 0);
	const serialSeconds = ((verifierOnly ? judgeMs || totalMs : totalMs) * scale) / 1000;
	const writerSeconds = verifierOnly ? 0 : (Math.max(0, totalMs - judgeMs) * scale) / 1000;
	const verifierSeconds = ((judgeMs || totalMs) * scale) / 1000;
	return {
		sessions,
		measuredSessions: measured.length,
		openRouterUsd: (measured.reduce((n, c) => n + (c.openRouterCostMicros ?? 0), 0) * scale) / 1e6,
		openaiUsd: verifierOnly ? 0 : (measured.reduce((n, c) => n + (c.openaiCostMicros ?? 0), 0) * scale) / 1e6,
		serialSeconds,
		parallelSeconds: Math.max(serialSeconds / 16, writerSeconds / 8, verifierSeconds / 8),
		concurrency: { session: 16, openai: 8, together: 8 },
		extraCanaryCalls: 0,
	};
}

export type ReviewPacket = {
	version: number;
	outputs: {
		id: string;
		key: string;
		writerDigest: string;
		requiresArabic: boolean;
		segments: { sourceId: string; text: string }[];
	}[];
};
export function translationReviewOutputs(cases: TaskCase[], calls: BenchmarkCall[]) {
	return calls
		.filter((c) => c.category === "translation")
		.sort((a, b) => a.key.localeCompare(b.key))
		.map((c) => {
			const fixture = required(cases.find((f) => f.id === c.caseId));
			const output = JSON.parse(c.output);
			return {
				id: "TR-" + digest([c.key, c.outputDigest]).slice(0, 20),
				key: c.key,
				writerDigest: c.outputDigest,
				requiresArabic: fixture.language !== "en" || output.direction === "en-ar",
				language: c.language,
				direction: output.direction,
				source: fixture.cv,
				approvedAliases: (fixture as unknown as { translationAliases: unknown }).translationAliases,
				writerNotes: output.notes,
				segments: output.segments.map((s: { sourceId: string; text: string }) => ({
					sourceId: s.sourceId,
					text: s.text,
				})),
			};
		});
}
const ratingSchema = z.strictObject({
	outputId: z.string().min(1),
	fidelity: z.number().int().min(1).max(5),
	naturalness: z.number().int().min(1).max(5),
	arabic: z.number().int().min(1).max(5).nullable(),
	unsupportedFact: z.boolean(),
	notes: z.string().trim().min(1),
	mqm: z
		.array(
			z.strictObject({
				sourceId: z.string(),
				start: z.number().int().nonnegative(),
				end: z.number().int().positive(),
				severity: z.enum(["major", "minor"]),
				category: z.enum(["accuracy", "fluency", "terminology", "locale", "style"]),
			}),
		)
		.max(10),
});
const passSchema = z.strictObject({
	version: z.literal(1),
	reviewKind: z.enum(["ai", "fixture"]),
	model: z.string(),
	reviewer: z.string().trim().min(1),
	sessionId: z.string().trim().min(1),
	ratings: z.array(ratingSchema),
});
export function rateTranslations(packet: ReviewPacket, raw: unknown[], fixture = false) {
	if (raw.length !== 2) throw new Error("TWO_INDEPENDENT_RATINGS_REQUIRED");
	const passes = raw.map((p) => {
		const r = passSchema.safeParse(p);
		if (!r.success) throw new Error("INVALID_RATING");
		if (r.data.reviewKind !== (fixture ? "fixture" : "ai") || r.data.model !== (fixture ? "scripted" : "gpt-6-astra"))
			throw new Error("REAL_ASTRA_RATINGS_REQUIRED");
		return r.data;
	});
	if (new Set(passes.map((p) => p.reviewer)).size !== 2 || new Set(passes.map((p) => p.sessionId)).size !== 2)
		throw new Error("TWO_INDEPENDENT_RATINGS_REQUIRED");
	const results = new Map<
		string,
		{ quality: number; votes: (z.infer<typeof ratingSchema> & { reviewer: string })[] }
	>();
	for (const pass of passes) {
		if (
			pass.ratings.length !== packet.outputs.length ||
			new Set(pass.ratings.map((v) => v.outputId)).size !== packet.outputs.length ||
			pass.ratings.some((v) => !packet.outputs.some((o) => o.id === v.outputId))
		)
			throw new Error("INCOMPLETE_RATINGS");
		for (const o of packet.outputs) {
			const v = required(pass.ratings.find((v) => v.outputId === o.id));
			if (o.requiresArabic && v.arabic === null) throw new Error("INVALID_RATING");
			if (
				v.mqm.some(
					(e) => !o.segments.some((s) => s.sourceId === e.sourceId && e.start < e.end && e.end <= s.text.length),
				) ||
				new Set(v.mqm.map((e) => digest(e))).size !== v.mqm.length
			)
				throw new Error("INVALID_MQM");
			const row = results.get(o.key) ?? { quality: 0, votes: [] };
			row.quality += v.mqm.reduce((n, e) => n + (e.severity === "major" ? 5 : 1), 0) / 2;
			row.votes.push({ ...v, reviewer: pass.reviewer });
			results.set(o.key, row);
		}
	}
	return results;
}
