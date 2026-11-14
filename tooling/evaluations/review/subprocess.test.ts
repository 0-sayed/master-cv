import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { captureCommand } from "./subprocess";

it("captures actual child output and failure status under the explicit output directory", async () => {
	const out = await mkdtemp(join(tmpdir(), "review-subprocess-"));
	try {
		const nested = join(out, "new-output");
		const result = captureCommand(
			process.execPath,
			["-e", 'console.log("أهلا"); console.error("failure"); process.exitCode = 7;'],
			{ out: nested },
		);
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(7);
		expect(result.stdout).toBe("أهلا\n");
		expect(result.stderr).toBe("failure\n");
		expect(await readdir(nested)).toEqual([]);
	} finally {
		await rm(out, { recursive: true, force: true });
	}
});
