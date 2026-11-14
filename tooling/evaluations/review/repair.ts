import type { ModelConfig } from "./config";
import type { BenchmarkCall, Calibration } from "./runner";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { cases } from "./corpus";
import { prepareCase, type ExecutionCase } from "./execution";
import { readJournal } from "./journal";
import { fixtureHash, studyHash } from "./study";
import { benchmarkVerifierSpec } from "./verifier";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bytesHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const repairSource = {
	manifestHash: "84494d94c818c8a6010073d07ee697b308792c3838fb6e9faeaeea193a6f5b25",
	journalHash: "fec450cf43532358a8a7a82005a0459ee1bef3def23105e4ddff71cb3a4c70ce",
	studyHash: "76c85f0962d8a40f5106ee758788c68decb3a3b37af7e0a60a99151887996b75",
};
export type RepairManifest = {
	hash: string;
	models: ModelConfig[];
	runs: number;
	budgetUsd: number;
	openaiBudgetUsd: number;
	priorSpendMicros: number;
	priorOpenaiSpendMicros: number;
	calibration: Calibration[];
};
export type RepairSlot = {
	key: string;
	model: string;
	provider: string;
	reasoning: string;
	caseId: string;
	category: string;
	runIndex: number;
	fromPromptHash: string;
	toPromptHash: string;
	action: "rerun" | "reuse" | "model-error";
	reason: string;
};
export type RepairPlan = {
	fromStudyHash: string;
	toStudyHash: string;
	source: typeof repairSource;
	slots: RepairSlot[];
};
export function sessionPromptHash(c: ExecutionCase) {
	const { handler } = prepareCase(c);
	const verifier = benchmarkVerifierSpec(c);
	return digest({
		verifierPrompt: verifier.systemPrompt,
		verifierSchema: z.toJSONSchema(verifier.schema, { unrepresentable: "any" }),
		prompt: handler.systemPrompt,
		schema: z.toJSONSchema(handler.output, { unrepresentable: "any" }),
	});
}
export async function readRepairSource(folder: string, manifestText?: string) {
	const manifestBody = manifestText ?? (await readFile(join(folder, "manifest.json"), "utf8"));
	const journalBody = await readFile(join(folder, "calls.jsonl"), "utf8");
	if (bytesHash(manifestBody) !== repairSource.manifestHash || bytesHash(journalBody) !== repairSource.journalHash)
		throw new Error("REPAIR_SOURCE_MISMATCH");
	return {
		manifest: JSON.parse(manifestBody) as RepairManifest,
		history: await readJournal(join(folder, "calls.jsonl")),
		journalBody,
	};
}
export function createRepairPlan(
	manifest: RepairManifest,
	history: Awaited<ReturnType<typeof readJournal>>,
): RepairPlan {
	if (manifest.hash !== repairSource.studyHash) throw new Error("REPAIR_SOURCE_MISMATCH");
	const latest = [...new Map(history.previousCalls.map((c) => [c.key, c])).values()];
	return {
		fromStudyHash: manifest.hash,
		toStudyHash: studyHash(manifest.models, cases, manifest.runs),
		source: repairSource,
		slots: latest.map((call) => {
			const c = cases.find((c) => c.id === call.caseId);
			if (!c || fixtureHash(c) !== call.fixtureHash) throw new Error("REPAIR_FIXTURE_MISMATCH");
			const action = "rerun" as const;
			const reason =
				"The changed writer/verifier contract defines a new study; no historical judgment or output qualifies";
			return {
				key: call.key,
				model: call.model,
				provider: call.provider,
				reasoning: call.reasoning,
				caseId: call.caseId,
				category: call.category,
				runIndex: call.runIndex,
				fromPromptHash: call.promptDigest,
				toPromptHash: sessionPromptHash(c),
				action,
				reason,
			};
		}),
	};
}
export function repairSlot(plan: RepairPlan | undefined, call: BenchmarkCall) {
	return plan?.slots.find(
		(s) =>
			s.key === call.key &&
			s.model === call.model &&
			s.provider === call.provider &&
			s.reasoning === call.reasoning &&
			s.caseId === call.caseId &&
			s.runIndex === call.runIndex,
	);
}

/** A repaired folder is a new study with an immutable, exactly pinned source.
 * Normal smoke and resume identity checks still apply to its current manifest. */
export async function validateRepairFolder(folder: string, targetHash: string) {
	const original = await readRepairSource(join(folder, "source"));
	const plan = createRepairPlan(original.manifest, original.history);
	const recorded = JSON.parse(await readFile(join(folder, "repair-plan.json"), "utf8"));
	const journal = await readFile(join(folder, "calls.jsonl"), "utf8");
	if (
		plan.toStudyHash !== targetHash ||
		!isDeepStrictEqual(plan, recorded) ||
		!journal.startsWith(original.journalBody)
	)
		throw new Error("REPAIR_TARGET_MISMATCH");
	return { plan, original: original.manifest };
}
