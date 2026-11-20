import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { type CopyContractInput, validateCopyBindings } from "./copy-contract";

it("keeps public entry and draft legal promises aligned in both locales", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	) as CopyContractInput["deck"];
	const catalogs = Object.fromEntries(
		await Promise.all(
			(["ar-SA", "en-US"] as const).map(async (locale) => [
				locale,
				formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
					locale,
					sourceLocale: "en-US",
					filename: `${locale}.po`,
				}),
			]),
		),
	);
	const promises = [
		["landing.hero.title", "اكتب سيرتك وراجعها، ثم نزّلها بصيغة PDF.", "Write and review your CV, then download a PDF."],
		["landing.hero.startFree", "ابدأ مجانًا", "Start free"],
		[
			"landing.example.disclosure",
			"مثال توضيحي ببيانات افتراضية، وليس نتيجة مستخدم أو تحليلًا مباشرًا.",
			"Illustrative example with synthetic facts, not a user result or a live analysis.",
		],
		[
			"legal.draft.notice",
			"مسودة للمراجعة — ليست سياسة نهائية معتمدة.",
			"Review draft — not an approved final policy.",
		],
	] as const;
	for (const [key, arabic, english] of promises) {
		const entry = deck.entries.find((candidate) => candidate.key === key);
		expect(entry, key).toBeDefined();
		if (!entry) throw new Error(`Missing public copy: ${key}`);
		expect(entry.messages).toEqual({ "ar-SA": arabic, "en-US": english });
		for (const locale of ["ar-SA", "en-US"] as const) {
			expect(catalogs[locale][entry.lingui.runtimeId]?.translation).toBe(entry.messages[locale]);
			expect(catalogs[locale][entry.lingui.runtimeId]?.obsolete).not.toBe(true);
		}
	}
});

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

it("translates every extracted web message in both product locales without fallback", async () => {
	const parse = async (locale: "ar-SA" | "en-US") =>
		formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
			locale,
			sourceLocale: "en-US",
			filename: `${locale}.po`,
		});
	const catalogs = await Promise.all([parse("ar-SA"), parse("en-US")]);
	const [arabic, english] = catalogs;
	const missing = Object.entries(english).flatMap(([id, entry]) => {
		if (!entry.message || entry.obsolete) return [];
		return catalogs.flatMap((catalog, index) =>
			!catalog[id]?.translation?.trim() || catalog[id]?.obsolete
				? [`${index === 0 ? "ar-SA" : "en-US"}: ${entry.message}`]
				: [],
		);
	});
	expect(missing).toEqual([]);
	expect(Object.keys(arabic).length).toBeGreaterThan(0);
});
