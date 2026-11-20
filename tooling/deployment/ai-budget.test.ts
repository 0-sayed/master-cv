import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";

it("renews AI budgets from a stopped app image while PostgreSQL stays available", async () => {
	const directory = await mkdtemp(join(tmpdir(), "sirawise-budget-"));
	try {
		const deploy = await readFile(new URL("../../deploy/contabo/deploy.sh", import.meta.url), "utf8");
		const script = deploy.split("<<'SCRIPT'\n")[1]?.split("\nSCRIPT")[0];
		if (!script) throw new Error("Missing budget script");
		await writeFile(
			join(directory, "budget.sh"),
			script.replace("remote_dir='/opt/sirawise'", `remote_dir='${directory}'`),
		);
		await writeFile(
			join(directory, "docker"),
			`#!/usr/bin/env bash
set -eu
case "$*" in
  *"ps -q --all app") echo stopped-app ;;
  *"ps -q app") exit 0 ;;
  *"ps -q postgres") echo live-postgres ;;
  "inspect --format {{.Config.Image}} stopped-app") echo sirawise-app:test ;;
  "run --rm --network container:live-postgres "*) printf '%s' "$*" >> "$BUDGET_LOG" ;;
  *) exit 1 ;;
esac
`,
		);
		await chmod(join(directory, "docker"), 0o700);
		const result = spawnSync("bash", [join(directory, "budget.sh")], {
			env: { PATH: `${directory}:${process.env.PATH}`, BUDGET_LOG: join(directory, "run.log") },
			encoding: "utf8",
		});
		expect(result.status, result.stderr).toBe(0);
		expect(await readFile(join(directory, "run.log"), "utf8")).toContain("--entrypoint node sirawise-app:test");
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
