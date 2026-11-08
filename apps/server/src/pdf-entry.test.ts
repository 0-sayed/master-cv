import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

it("loads the PDF server entry through the development Node/tsx loader", () => {
	// Vite and tsdown resolve extensionless .node paths differently from Node/tsx.
	const result = spawnSync(
		process.execPath,
		["--import", "tsx", "--input-type=module", "-e", 'await import("@reactive-resume/pdf/server")'],
		{ cwd: fileURLToPath(new URL("..", import.meta.url)), encoding: "utf8", timeout: 20_000 },
	);
	expect(result.error).toBeUndefined();
	expect(result.status, result.stderr).toBe(0);
});
