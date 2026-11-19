import { readFile, readdir } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { validateCopyContract, type CopyContractInput } from "./copy-contract";

it("binds the Review guide to complete Arabic and English catalogs", async () => {
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
	const [ar, en] = await Promise.all([parse("ar-SA"), parse("en-US")]);
	const surfaces = inventory.surfaces.filter((surface) => surface.id === "ats-guide");
	const keys = new Set(surfaces.flatMap((surface) => surface.keys));
	const entries = deck.entries.filter((entry) => keys.has(entry.key));
	const ids = new Set(entries.map((entry) => entry.lingui.runtimeId));
	const scoped = (catalog: typeof ar) =>
		Object.fromEntries(
			Object.entries(catalog).filter(
				([id, message]) =>
					ids.has(id) ||
					message.origin?.some(([path]) =>
						surfaces.some((surface) => surface.sources.some((source) => path.startsWith(source))),
					),
			),
		);
	expect(
		validateCopyContract({
			deck: { ...deck, entries },
			surfaces,
			catalogs: { "ar-SA": scoped(ar), "en-US": scoped(en) },
		}),
	).toEqual([]);
});

it("keeps every extracted guide message in the deck and every locale catalog", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as CopyContractInput["deck"];
	const directory = new URL("../../apps/web/locales/", import.meta.url);
	const parse = async (filename: string) =>
		formatter().parse(await readFile(new URL(filename, directory), "utf8"), {
			locale: filename.replace(/\.po$/, ""),
			sourceLocale: "en-US",
			filename,
		});
	const source = await parse("en-US.po");
	const messages = Object.entries(source).filter(
		([, message]) =>
			!message.obsolete &&
			message.origin?.some(
				([path]) =>
					path.startsWith("src/features/ats-guide/") || path === "src/features/resume/editor/check/review-tabs.ts",
			),
	);
	expect(messages.length).toBeGreaterThan(250);
	for (const [id] of messages)
		expect(
			deck.entries.some((entry) => entry.lingui.runtimeId === id),
			id,
		).toBe(true);
	for (const filename of (await readdir(directory)).filter((name) => name.endsWith(".po"))) {
		const catalog = await parse(filename);
		for (const [id] of messages) {
			expect(catalog[id], `${filename}: ${id}`).toBeDefined();
			expect(catalog[id]?.obsolete, `${filename}: ${id}`).not.toBe(true);
		}
	}
});
