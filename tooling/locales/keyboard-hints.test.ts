import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";

it("keeps platform-specific modifier glyphs out of every translation catalog", async () => {
	const directory = new URL("../../apps/web/locales/", import.meta.url);
	const violations: string[] = [];
	for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".po"))) {
		const catalog = await formatter().parse(await readFile(new URL(filename, directory), "utf8"), {
			filename,
			locale: filename.slice(0, -3),
			sourceLocale: "en-US",
		});
		for (const [id, entry] of Object.entries(catalog)) {
			if (/[⌘⌥⇧⌃]/u.test(`${entry.message ?? ""}${entry.translation ?? ""}`)) violations.push(`${filename}: ${id}`);
		}
	}
	expect(violations).toEqual([]);
});
