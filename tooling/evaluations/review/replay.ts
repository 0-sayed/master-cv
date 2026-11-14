import type { ModelConfig } from "./config";
import type { BenchmarkArtifact, RawRecord } from "./runner";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { cases } from "./corpus";
import { withArchivedVerifierPolicy } from "./production";
import { identityMapping, renderReport } from "./report";
import { required } from "./required";
import { runBenchmark } from "./runner";

/** Each historical session is isolated so a recorded shared fault does not hide the remaining replay evidence. */
export async function replayRecordedSmoke(folder: URL) {
	const original: BenchmarkArtifact = JSON.parse(readFileSync(new URL("results.json", folder), "utf8"));
	const manifest: { models: ModelConfig[] } = JSON.parse(readFileSync(new URL("manifest.json", folder), "utf8"));
	const raw = readFileSync(new URL("calls.jsonl", folder), "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as { type: string; data: RawRecord })
		.filter((r) => r.type === "raw")
		.map((r) => r.data);
	const calls: BenchmarkArtifact["calls"] = [];
	const sessionStops: { caseId: string; model: string; reasoning: string; reason: string }[] = [];
	for (const previous of original.calls) {
		const model = required(
			manifest.models.find(
				(m) => m.model === previous.model && m.provider === previous.provider && m.reasoning === previous.reasoning,
			),
		);
		const fixture = required(cases.find((c) => c.id === previous.caseId));
		let missingResponse = false;
		const replay = await withArchivedVerifierPolicy(() =>
			runBenchmark({
				verifierModels: manifest.models,
				models: [model],
				cases: [fixture],
				runs: 1,
				fake: false,
				key: "offline-replay-only",
				budgetUsd: 10,
				transport: (_url, init) => {
					const request = JSON.parse(String(init?.body));
					const verifying = JSON.parse(request.messages.at(-1).content).selections.some(
						(s: { id: string }) => s.id === "verification-claims",
					);
					const response = raw.find((r) => r.key === previous.key + (verifying ? ":verify" : ""));
					if (!response) {
						missingResponse = true;
						throw new Error("OFFLINE_REPLAY_MISSING_RESPONSE");
					}
					return Promise.resolve(
						new Response(response.body, {
							status: response.status,
							headers: { "content-type": "application/json" },
						}),
					);
				},
			}),
		);
		if (missingResponse) throw new Error(`OFFLINE_REPLAY_MISSING_RESPONSE:${previous.caseId}`);
		calls.push(...replay.calls);
		if (replay.stopReason)
			sessionStops.push({
				caseId: previous.caseId,
				model: previous.model,
				reasoning: previous.reasoning,
				reason: replay.stopReason,
			});
	}
	return {
		...original,
		id: `${original.id}-offline-replay`,
		calls,
		stopReason: "OFFLINE_REPLAY_NOT_QUALIFICATION",
		sessionStops,
		replaySource: fileURLToPath(folder),
		reservedUsd: calls.reduce((n, c) => n + (c.costMicros ?? c.reservedMicros), 0) / 1e6,
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	const { values } = parseArgs({ options: { out: { type: "string", short: "o" } }, strict: true });
	if (!values.out || !resolve(values.out).startsWith("/tmp/")) throw new Error("OUTPUT_UNDER_TMP_REQUIRED");
	await mkdir(values.out, { recursive: true });
	for (const run of ["2026-11-12T17-23-39.924Z-1d8e7b6f", "2026-11-12T17-46-52.507Z-fd7f6fd3"]) {
		const replay = await replayRecordedSmoke(new URL(`../results/${run}/`, import.meta.url));
		const folder = resolve(values.out, run);
		await mkdir(folder, { recursive: true });
		await writeFile(resolve(folder, "results.json"), JSON.stringify(replay, null, 2));
		await writeFile(resolve(folder, "scorecard.json"), JSON.stringify(identityMapping(replay), null, 2));
		await writeFile(resolve(folder, "report.html"), await renderReport(replay));
	}
}
