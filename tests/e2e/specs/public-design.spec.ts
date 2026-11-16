import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "../fixtures/test";

async function runDetector(args: string[], outputPath: string): Promise<{ exitCode: number }> {
	return new Promise((accept, reject) => {
		const child = spawn(process.env.IMPECCABLE_BIN ?? "impeccable", ["detect", "--json", ...args], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.once("close", (code) => {
			clearTimeout(timeout);
			void Promise.all([writeFile(outputPath, stdout), writeFile(`${outputPath}.stderr`, stderr)]).then(
				() => accept({ exitCode: code ?? 1 }),
				reject,
			);
		});
	});
}
test("reports public design findings against the isolated live site", async ({ baseURL }, info) => {
	test.setTimeout(600_000);
	if (!baseURL) throw new Error("Missing isolated live URL");
	const directory = process.env.E2E_PUBLIC_EVIDENCE_DIR ?? info.outputDir;
	await mkdir(directory, { recursive: true });
	const scans: { name: string; args: string[] }[] = [
		{
			name: "public-source",
			args: [
				"apps/web/src/features/homepage",
				"apps/web/src/features/legal",
				"apps/web/src/features/help/public-shell.tsx",
			],
		},
	];
	for (const [name, path] of [
		["home", "/"],
		["privacy", "/privacy-and-terms?tab=privacy"],
		["terms", "/privacy-and-terms?tab=terms"],
		["help", "/help"],
	])
		for (const locale of ["ar-SA", "en-US"])
			for (const width of [1440, 390]) {
				const url = new URL(path, baseURL);
				url.searchParams.set("locale", locale);
				scans.push({
					name: `${name}-${locale}-${width}`,
					args: [
						"--no-consent-hiding",
						"--no-overlay-hiding",
						"--viewport",
						`${width}x${width === 390 ? 844 : 900}`,
						url.href,
					],
				});
			}
	const results = [];
	for (const scan of scans) {
		const output = resolve(directory, `detector-${scan.name}.json`);
		const started = Date.now();
		const result = await runDetector(scan.args, output);
		results.push({ name: scan.name, ...result, wallMs: Date.now() - started, args: scan.args, output });
		console.log(`Detector ${scan.name}: exit ${result.exitCode}, ${Date.now() - started}ms`);
	}
	await writeFile(resolve(directory, "detector-results.json"), JSON.stringify(results, null, 2));
	// Findings (2) need classification; operational failure (1) is never a clean scan.
	for (const result of results) expect([0, 2], result.name).toContain(result.exitCode);
});
