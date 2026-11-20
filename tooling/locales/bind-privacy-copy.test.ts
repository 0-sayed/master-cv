import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";

it.each([
	"workspace.documents.cancel_dEgA5A",
	"workspace.documents.rename_2wxgft",
	"workspace.documents.try.again_KDw4GX",
])("keeps %s excluded from settings in a targeted bind", async (key) => {
	const directory = await mkdtemp(join(tmpdir(), "sirawise-copy-"));
	try {
		for (const path of ["tooling/locales", "Planning/context/design", "apps/web/locales"])
			await mkdir(join(directory, path), { recursive: true });
		await symlink(fileURLToPath(new URL("../node_modules", import.meta.url)), join(directory, "node_modules"));
		const source = await readFile(new URL("./bind-privacy-copy.mts", import.meta.url), "utf8");
		await writeFile(join(directory, "tooling/locales/bind-privacy-copy.mts"), source);
		await writeFile(
			join(directory, "Planning/context/design/copy-deck.json"),
			JSON.stringify({
				entries: [
					{
						key,
						messages: { "en-US": "Cancel" },
						lingui: { runtimeId: generateMessageId("Cancel", key), msgctxt: key },
					},
				],
			}),
		);
		await writeFile(
			join(directory, "apps/web/locales/en-US.po"),
			`#: src/features/settings/page.tsx\nmsgctxt "${key}"\nmsgid "Cancel"\nmsgstr "Cancel"\n`,
		);
		const inventory = join(directory, "tooling/locales/active-surfaces.json");
		await writeFile(
			inventory,
			JSON.stringify({ surfaces: [{ id: "settings", sources: ["src/features/settings"], keys: [key, "keep.this"] }] }),
		);
		const result = spawnSync(
			process.execPath,
			["--import", "tsx", join(directory, "tooling/locales/bind-privacy-copy.mts"), key],
			{ encoding: "utf8" },
		);
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(await readFile(inventory, "utf8")).surfaces[0].keys).toEqual(["keep.this"]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
