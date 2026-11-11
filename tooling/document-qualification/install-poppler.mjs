import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Both mirrors serve the exact pinned Ubuntu package; integrity never depends on the mirror.
export async function downloadPackage(item) {
	const urls = [item.url, item.url.replace("https://archive.ubuntu.com/", "https://security.ubuntu.com/")];
	let lastError;
	for (const url of new Set(urls)) {
		for (let attempt = 1; attempt <= 3; attempt++) {
			let bytes;
			try {
				const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				bytes = Buffer.from(await response.arrayBuffer());
			} catch (error) {
				lastError = error;
				console.warn(`${item.name}: ${url} attempt ${attempt}/3: ${error.message} (${error.cause?.code ?? ""})`);
				if (attempt < 3) await new Promise((done) => setTimeout(done, 1000 * 2 ** (attempt - 1)));
				continue;
			}
			if (sha256(bytes) !== item.sha256) throw new Error(`${item.name}: checksum mismatch`);
			return bytes;
		}
	}
	throw new Error(`${item.name}: download failed on all mirrors`, { cause: lastError });
}

async function validArtifacts(root, pins) {
	const artifacts = [
		["usr/bin/pdftotext", pins.poppler.artifacts.binary],
		["usr/lib/x86_64-linux-gnu/libpoppler.so.118", pins.poppler.artifacts.library],
	];
	try {
		for (const [path, expected] of artifacts) {
			if (sha256(await readFile(join(root, path))) !== expected) return false;
		}
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw error;
	}
}

// Extract only: this never installs packages or replaces the host's system reader.
export async function installPoppler({
	root = resolve(process.env.DOCUMENT_TOOLCHAIN_DIRECTORY ?? ".cache/document-toolchain"),
	pins: suppliedPins,
} = {}) {
	const pins = suppliedPins ?? JSON.parse(await readFile(new URL("./versions.json", import.meta.url), "utf8"));
	if (process.platform !== "linux" || process.arch !== "x64")
		throw new Error("Pinned Poppler requires Linux x64 with Ubuntu 22.04 runtime libraries");
	await mkdir(root, { recursive: true });
	let marker;
	try {
		marker = JSON.parse(await readFile(join(root, "pins.json"), "utf8"));
	} catch (error) {
		if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
	}
	const cached = JSON.stringify(marker) === JSON.stringify(pins) && (await validArtifacts(root, pins));
	if (!cached) {
		for (const item of pins.poppler.packages) {
			const path = join(root, `${item.name}.deb`);
			await writeFile(path, await downloadPackage(item));
			execFileSync("dpkg-deb", ["--extract", path, root], { timeout: 30_000 });
		}
		if (!(await validArtifacts(root, pins))) throw new Error("Pinned reader artifact checksum mismatch");
	}
	const bin = join(root, "bin");
	await mkdir(bin, { recursive: true });
	// Resolve relative to the wrapper so a cache restored into another checkout still works.
	const script = `#!/usr/bin/env node\nconst {spawnSync}=require('node:child_process');\nconst {resolve}=require('node:path');\nconst root=resolve(__dirname,'..');\nconst result=spawnSync(resolve(root,'usr/bin/pdftotext'),process.argv.slice(2),{stdio:'inherit',env:{...process.env,LD_LIBRARY_PATH:resolve(root,'usr/lib/x86_64-linux-gnu')+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')}});\nif(result.error)throw result.error;\nprocess.exit(result.status??1);\n`;
	await writeFile(join(bin, "pdftotext"), script, { mode: 0o755 });
	const version = spawnSync(join(bin, "pdftotext"), ["-v"], { encoding: "utf8", timeout: 10_000 });
	if (version.status !== 0 || !(version.stdout + version.stderr).includes(`pdftotext version ${pins.poppler.upstream}`))
		throw new Error(`Pinned reader failed version verification: ${version.error?.message ?? version.stderr}`);
	await writeFile(join(root, "pins.json"), JSON.stringify(pins, null, 2));
	console.log(`Verified ${cached ? "cached" : "and extracted"} ${pins.poppler.revision}. Add ${bin} to PATH.`);
}

if (import.meta.main) await installPoppler();
