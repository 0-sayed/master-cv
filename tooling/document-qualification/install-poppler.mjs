import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

// Extract only: this never installs packages or replaces the host's system reader.
const pins = JSON.parse(await readFile(new URL("./versions.json", import.meta.url), "utf8"));
if (process.platform !== "linux" || process.arch !== "x64")
	throw new Error("Pinned Poppler requires Linux x64 with Ubuntu 22.04 runtime libraries");
const root = resolve(process.env.DOCUMENT_TOOLCHAIN_DIRECTORY ?? ".cache/document-toolchain");
await mkdir(root, { recursive: true });
for (const item of pins.poppler.packages) {
	const response = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
	if (!response.ok) throw new Error(`${item.name}: HTTP ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	if (createHash("sha256").update(bytes).digest("hex") !== item.sha256)
		throw new Error(`${item.name}: checksum mismatch`);
	const path = join(root, `${item.name}.deb`);
	await writeFile(path, bytes);
	execFileSync("dpkg-deb", ["--extract", path, root]);
}
const bin = join(root, "bin");
await mkdir(bin, { recursive: true });
const script = `#!/usr/bin/env node\nconst {spawnSync}=require('node:child_process');\nconst result=spawnSync(${JSON.stringify(join(root, "usr/bin/pdftotext"))},process.argv.slice(2),{stdio:'inherit',env:{...process.env,LD_LIBRARY_PATH:${JSON.stringify(join(root, "usr/lib/x86_64-linux-gnu"))}+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')}});\nif(result.error)throw result.error;\nprocess.exit(result.status??1);\n`;
await writeFile(join(bin, "pdftotext"), script, { mode: 0o755 });
const version = spawnSync(join(bin, "pdftotext"), ["-v"], { encoding: "utf8" });
if (version.status !== 0 || !(version.stdout + version.stderr).includes(`pdftotext version ${pins.poppler.upstream}`))
	throw new Error("Pinned reader failed version verification");
await writeFile(join(root, "pins.json"), JSON.stringify(pins, null, 2));
console.log(`Verified and extracted ${pins.poppler.revision}. Add ${bin} to PATH.`);
