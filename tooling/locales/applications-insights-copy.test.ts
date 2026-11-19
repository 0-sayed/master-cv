import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { type CopyContractInput, validateCopyContract } from "./copy-contract";

it("binds concise bilingual insight copy with matching placeholders and Latin digits", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as CopyContractInput["deck"];
	const rows = deck.entries.filter((row) => row.key.startsWith("applications.insights."));
	expect(rows.length).toBeGreaterThanOrEqual(40);
	for (const row of rows) {
		expect(row.messages["ar-SA"]).toBeTruthy();
		expect(row.messages["ar-SA"]).not.toMatch(/[\u0660-\u0669\u06f0-\u06f9]/u);
	}
	expect(
		validateCopyContract({
			deck: { ...deck, entries: rows },
			catalogs: { "ar-SA": {}, "en-US": {} },
			surfaces: [],
		}),
	).toEqual([]);
	expect(rows.find((row) => row.key === "applications.insights.noncausal")?.messages["en-US"]).toContain("do not show");
	expect(rows.find((row) => row.key === "applications.insights.sample")?.messages["en-US"]).toContain("5");
});
