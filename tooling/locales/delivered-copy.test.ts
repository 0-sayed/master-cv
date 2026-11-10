import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { type CopyContractInput, validateCopyBindings } from "./copy-contract";

it("keeps every delivered copy binding synchronized with the deck and extracted catalogs", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	);
	const inventory = JSON.parse(await readFile(new URL("./active-surfaces.json", import.meta.url), "utf8"));
	const parse = async (locale: "ar-SA" | "en-US") =>
		formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
			locale,
			sourceLocale: "en-US",
			filename: `${locale}.po`,
		});
	const input: CopyContractInput = {
		deck,
		surfaces: inventory.surfaces,
		catalogs: { "ar-SA": await parse("ar-SA"), "en-US": await parse("en-US") },
	};
	expect(validateCopyBindings(input)).toEqual([]);
});
