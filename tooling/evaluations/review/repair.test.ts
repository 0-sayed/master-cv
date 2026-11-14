import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { cases } from "./corpus";
import { createRepairPlan, readRepairSource, validateRepairFolder } from "./repair";
import { runBenchmark, type RawRecord } from "./runner";

const source = fileURLToPath(new URL("../results/2026-11-13T06-30-48.077Z-c283d9cd", import.meta.url));
it("binds migration to the exact source manifest and immutable journal prefix", async () => {
	const original = await readRepairSource(source);
	const plan = createRepairPlan(original.manifest, original.history);
	expect(plan.slots).toHaveLength(540);
	expect(plan.slots.filter((s) => s.category === "extraction" && s.action === "rerun")).toHaveLength(135);
	expect(plan.slots.filter((s) => s.action === "rerun")).toHaveLength(540);
	expect(plan.slots.filter((s) => s.action === "reuse")).toHaveLength(0);
	expect(plan.slots.filter((s) => s.action === "model-error")).toHaveLength(0);
	await expect(readRepairSource(source, JSON.stringify(original.manifest) + " ")).rejects.toThrow(
		"REPAIR_SOURCE_MISMATCH",
	);
});
it("rejects a changed repair identity, receipt or historical journal", async () => {
	const original = await readRepairSource(source);
	const plan = createRepairPlan(original.manifest, original.history);
	const folder = await mkdtemp(join(tmpdir(), "study-migration-test-"));
	try {
		await mkdir(join(folder, "source"));
		for (const name of ["manifest.json", "calls.jsonl"])
			await copyFile(join(source, name), join(folder, "source", name));
		await writeFile(join(folder, "calls.jsonl"), original.journalBody);
		await writeFile(join(folder, "repair-plan.json"), JSON.stringify(plan));
		await expect(validateRepairFolder(folder, plan.toStudyHash)).resolves.toMatchObject({ plan });
		await expect(validateRepairFolder(folder, "changed")).rejects.toThrow("REPAIR_TARGET_MISMATCH");
		await writeFile(join(folder, "repair-plan.json"), JSON.stringify({ ...plan, slots: [] }));
		await expect(validateRepairFolder(folder, plan.toStudyHash)).rejects.toThrow("REPAIR_TARGET_MISMATCH");
		await writeFile(join(folder, "repair-plan.json"), JSON.stringify(plan));
		await writeFile(join(folder, "calls.jsonl"), "");
		await expect(validateRepairFolder(folder, plan.toStudyHash)).rejects.toThrow("REPAIR_TARGET_MISMATCH");
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});
it("does not disable repaired variants using invalidated historical extraction outcomes", async () => {
	const { manifest, history } = await readRepairSource(source);
	const plan = createRepairPlan(manifest, history);
	const old = history.previousCalls
		.filter((c) => c.provider === "together" && c.category === "extraction")
		.slice(0, 10);
	const model = manifest.models.find((m) => m.model === old[0]?.model && m.reasoning === old[0]?.reasoning);
	if (!model || !old[0]) throw new Error("fixture");
	let sends = 0;
	const result = await runBenchmark({
		models: [model],
		cases: cases.filter((c) => c.id === old[0]?.caseId),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		previousCalls: old,
		repairPlan: plan,
		onRaw: async (r) => {
			if (!r.key.endsWith(":verify")) sends++;
		},
	});
	expect(result.modelStops).toEqual([]);
	expect(sends).toBe(1);
});
it("repurchases an invalidated extraction writer once and keeps prior charges on both resumes", async () => {
	const { manifest, history } = await readRepairSource(source);
	const plan = createRepairPlan(manifest, history);
	const old = history.previousCalls.find((c) => c.provider === "together" && c.category === "extraction");
	if (!old) throw new Error("fixture");
	const model = manifest.models.find((m) => m.model === old.model && m.reasoning === old.reasoning);
	if (!model) throw new Error("fixture");
	const raw: RawRecord[] = [];
	const options = {
		models: [model],
		cases: cases.filter((c) => c.id === old.caseId),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		repairPlan: plan,
	};
	const first = await runBenchmark({
		...options,
		previousCalls: [old],
		rawRecords: history.rawRecords.filter((r) => r.key === old.key),
		onRaw: async (r) => {
			raw.push(r);
		},
	});
	expect(first.stopReason).toBeNull();
	expect(first.calls).toHaveLength(1);
	expect(raw.filter((r) => !r.key.endsWith(":verify"))).toHaveLength(1);
	expect(first.calls[0]?.priorAttemptOpenRouterMicros).toBe(old.openRouterCostMicros);
	expect(first.reservedUsd).toBeGreaterThan((old.openRouterCostMicros ?? 0) / 1e6);
	let sends = 0;
	const again = await runBenchmark({
		...options,
		previousCalls: first.calls,
		rawRecords: [...history.rawRecords.filter((r) => r.key === old.key), ...raw],
		onRaw: async () => {
			sends++;
		},
	});
	expect(sends).toBe(0);
	expect(again.reservedUsd).toBe(first.reservedUsd);
	expect(again.calls).toEqual(first.calls);
});
it("keeps all unfinished reservations held before any repaired dispatch", async () => {
	const { manifest, history } = await readRepairSource(source);
	const plan = createRepairPlan(manifest, history);
	let sends = 0;
	const result = await runBenchmark({
		models: manifest.models,
		cases: cases.filter((c) => !c.exploratory),
		runs: 3,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		...history,
		pendingReservations: [
			...history.pendingReservations,
			{ key: "interrupted-writer", reservedMicros: 500, reservedOpenRouterMicros: 500, reservedOpenaiMicros: 0 },
		],
		repairPlan: plan,
		onRaw: async () => {
			sends++;
		},
	});
	expect(result.stopReason).toBe("PENDING_BILLING");
	expect(sends).toBe(0);
});
it("counts invalidated writers as new work under the unverified dispatch limit", async () => {
	const { manifest, history } = await readRepairSource(source);
	const plan = createRepairPlan(manifest, history);
	const old = history.previousCalls
		.filter((c) => c.provider === "google-vertex" && c.category === "extraction" && c.runIndex === 0)
		.slice(0, 3);
	const models = [
		manifest.models.find((m) => m.provider === "openai"),
		manifest.models.find((m) => m.provider === "google-vertex"),
	];
	const openai = models[0];
	const vertex = models[1];
	if (!openai || !vertex) throw new Error("fixture");
	let active = 0;
	let peak = 0;
	const sent: string[] = [];
	const result = await runBenchmark({
		models: [openai, vertex],
		cases: cases.filter((c) => old.some((p) => p.caseId === c.id)),
		runs: 1,
		fake: true,
		budgetUsd: 100,
		openaiBudgetUsd: 100,
		maxUnverified: 1,
		previousCalls: old,
		rawRecords: history.rawRecords.filter((r) => old.some((p) => p.key === r.key)),
		repairPlan: plan,
		onReserve: async (r) => {
			if (!r.key.endsWith(":verify")) peak = Math.max(peak, ++active);
		},
		onRaw: async (r) => {
			if (!r.key.endsWith(":verify")) sent.push(r.model);
		},
		onCall: async () => {
			active--;
		},
	});
	expect(result.stopReason).toBeNull();
	expect(peak).toBe(1);
	expect(sent[0]).toBe(openai.model);
});
