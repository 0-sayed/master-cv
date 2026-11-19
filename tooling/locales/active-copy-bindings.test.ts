import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { type CopyContractInput, validateCopyBindings } from "./copy-contract";

it("keeps active copy bindings aligned with current extracted source identities", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as CopyContractInput["deck"];
	const inventory = JSON.parse(await readFile(new URL("./active-surfaces.json", import.meta.url), "utf8")) as {
		surfaces: CopyContractInput["surfaces"];
	};
	const parse = async (locale: "ar-SA" | "en-US") =>
		formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
			locale,
			sourceLocale: "en-US",
			filename: `${locale}.po`,
		});
	const [arabic, english] = await Promise.all([parse("ar-SA"), parse("en-US")]);
	expect(
		validateCopyBindings({ deck, surfaces: inventory.surfaces, catalogs: { "ar-SA": arabic, "en-US": english } }),
	).toEqual([]);
});
