import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release, arch } from "node:os";
import { join } from "node:path";
import { configureFontReader, downloadFont } from "@reactive-resume/pdf/native";
import { readServerFont } from "@reactive-resume/pdf/server";
import { templateSchema } from "@reactive-resume/schema/templates";
import { qualificationFixtures } from "./fixtures";
import { validateManifest } from "./manifest";
import { qualifyCase } from "./qualify";
import { qualificationPolicy, qualificationSuite } from "./suite";
import { verifiedPoppler } from "./toolchain";
import pins from "./versions.json";
export async function runQualification() {
	const suite = qualificationSuite(process.env);
	const policy = qualificationPolicy(process.env);
	const directory = join(
		process.env.DOCUMENT_QUALIFICATION_OUTPUT ?? join(import.meta.dirname, "../../test-results/document-qualification"),
		suite,
	);
	const started = performance.now();
	const authoredSuite =
		suite === "dev-holdout-2" ||
		suite === "holdout-3" ||
		suite === "dev-holdout-3" ||
		suite === "holdout-4" ||
		suite === "dev-holdout-4" ||
		suite === "holdout-5" ||
		suite === "dev-holdout-5" ||
		suite === "holdout-6";
	let inputs: unknown;
	if (authoredSuite) {
		const fixturePath = process.env.DOCUMENT_QUALIFICATION_FIXTURES;
		if (!fixturePath) throw new Error("Authored suite requires an explicit fixture manifest");
		inputs = JSON.parse(await readFile(fixturePath, "utf8"));
	} else inputs = qualificationFixtures();
	const all = validateManifest(inputs);
	const selected =
		suite === "matrix"
			? templateSchema.options.flatMap((template) =>
					["ar", "en", "mixed"].map((language) => {
						const source = all.find((item) => item.language === language);
						if (!source) throw new Error(`Missing language ${language}`);
						const item = structuredClone(source);
						item.id += `-${template}`;
						item.data.metadata.template = template;
						return item;
					}),
				)
			: suite === "pilot" || authoredSuite
				? all
				: all.filter((item) => item.split === "smoke");
	if (selected.length === 0) throw new Error("No qualification cases selected");
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "manifest.json"), JSON.stringify(all, null, 2));
	const toolchain = await verifiedPoppler();
	const popplerVersion = spawnSync(toolchain.binaryPath, ["-v"], { env: toolchain.env, encoding: "utf8" });
	if (popplerVersion.status !== 0) throw new Error("Unable to identify Poppler");
	const environment = {
		policy,
		recordedPolicies: ["strict v1", "fact-level v2", "fact-level v2.1"],
		startedAt: new Date().toISOString(),
		revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
		workingTree: "uncommitted; see git diff and source hashes",
		node: process.version,
		platform: platform(),
		release: release(),
		arch: arch(),
		cpu: cpus()[0]?.model,
		poppler: {
			version: (popplerVersion.stdout + popplerVersion.stderr).trim(),
			binaryPath: toolchain.binaryPath,
			revision: toolchain.revision,
			artifacts: toolchain.artifacts,
		},
		renderer: `@formepdf/core and @formepdf/react ${pins.forme}`,
		pdfjs: "6.4.299",
		shippedTemplates: templateSchema.options,
		testedTemplates: [...new Set(selected.map((item) => item.data.metadata.template))],
		fonts: [...new Set(selected.map((item) => item.data.metadata.typography.body.fontFamily))],
		aiCalls: 0,
		providerCost: 0,
		retries: 0,
	};
	await writeFile(join(directory, "environment.json"), JSON.stringify(environment, null, 2));
	const fonts = new Map<string, { source: string; sha256: string; bytes: number }>();
	configureFontReader(async (source) => {
		const bytes = await readServerFont(source);
		fonts.set(source, { source, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
		return bytes;
	});
	const results: (Awaited<ReturnType<typeof qualifyCase>> | { id: string; error: string; automatedPass: false })[] = [];
	for (const item of selected) {
		try {
			const result = await qualifyCase(item, directory, policy);
			results.push(result);
			console.log(`${item.id}: ${result.automatedPass ? "automated-pass" : "FAILED"} (human review pending)`);
		} catch (error) {
			results.push({ id: item.id, error: String(error), automatedPass: false });
			console.log(`${item.id}: ERROR ${error}`);
		}
	}
	configureFontReader(downloadFont);
	await writeFile(join(directory, "fonts.json"), JSON.stringify([...fonts.values()], null, 2));
	await writeFile(
		join(directory, "summary.json"),
		JSON.stringify(
			{
				policy,
				total: results.length,
				automatedPassed: results.filter((result) => result.automatedPass).length,
				policies: Object.fromEntries(
					(["strict v1", "fact-level v2", "fact-level v2.1"] as const).map((policy) => [
						policy,
						{
							automatedPassed: results.filter(
								(result) => "automatedPassByPolicy" in result && result.automatedPassByPolicy[policy],
							).length,
						},
					]),
				),
				humanAccepted: 0,
				durationMs: performance.now() - started,
				processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
				limitations: [
					"Draft synthetic gold; no native human Arabic review",
					"Held-out draft cases are not blind or accepted; remaining variants are not 50 independent reviewed scenarios",
					"Browser bytes require independent qualification",
					"Downloaded font hashes recorded; embedding license provenance and full OS/font dependency pinning still pending",
					"No approved performance thresholds or release template/font matrix",
				],
				results,
			},
			null,
			2,
		),
	);
	console.log(
		`Automated ${results.filter((result) => result.automatedPass).length}/${results.length}; human accepted 0/${results.length}`,
	);
	return results;
}
