import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { type CopyContractInput, validateCopyContract } from "./copy-contract";

it("binds application detail copy to both catalogs without changing saved content", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as CopyContractInput["deck"];
	const inventory = JSON.parse(await readFile(new URL("./active-surfaces.json", import.meta.url), "utf8")) as {
		surfaces: CopyContractInput["surfaces"];
	};
	const surface = inventory.surfaces.find((entry) => entry.id === "application-detail");
	if (!surface) throw new Error("Application detail must remain in the active copy inventory");
	const entries = deck.entries.filter((entry) => surface.keys.includes(entry.key));
	expect(entries.length).toBeGreaterThan(50);
	const ids = new Set(entries.map((entry) => entry.lingui.runtimeId));
	const catalog = async (locale: string) => {
		const source = await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8");
		const parsed = await formatter().parse(source, { locale, sourceLocale: "en-US", filename: `${locale}.po` });
		return Object.fromEntries(Object.entries(parsed).filter(([id]) => ids.has(id)));
	};
	expect(
		validateCopyContract({
			deck: { ...deck, entries },
			catalogs: { "ar-SA": await catalog("ar-SA"), "en-US": await catalog("en-US") },
			surfaces: [surface],
		}),
	).toEqual([]);
});
