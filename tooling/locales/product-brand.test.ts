import { readdir, readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";
import { getProductName } from "@reactive-resume/utils/brand";

it("keeps active bilingual messages and catalog brand values current", async () => {
	const deck = JSON.parse(
		await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
	);
	for (const locale of ["ar-SA", "en-US"]) {
		const expected = getProductName(locale);
		const brand = deck.entries.find((entry: { key: string }) => entry.key === "common.brand.name");
		expect(brand.messages[locale]).toBe(expected);
		const active = [
			...deck.entries.map((entry: { messages: Record<string, string> }) => entry.messages[locale]),
			...deck.glossary.map((entry: Record<string, string>) => entry[locale]),
		];
		for (const message of active) expect(message).not.toMatch(/Master CV|ماستر سي في|ماستر/i);
		const catalog = await formatter().parse(
			await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"),
			{ locale, sourceLocale: "en-US", filename: `${locale}.po` },
		);
		expect(catalog[brand.lingui.runtimeId]?.translation).toBe(expected);
		for (const key of ["email.reset.intro", "email.reset.preview", "email.reset.outro"]) {
			const message = deck.entries.find((entry: { key: string }) => entry.key === key);
			expect(message.messages[locale]).toContain(expected);
		}
	}
});

it("uses the current product brand in every locale translation", async () => {
	for (const app of ["web", "mobile"]) {
		const directory = new URL(`../../apps/${app}/locales/`, import.meta.url);
		for (const filename of await readdir(directory)) {
			if (!filename.endsWith(".po")) continue;
			const locale = filename.slice(0, -3);
			const catalog = await formatter().parse(await readFile(new URL(filename, directory), "utf8"), {
				locale,
				sourceLocale: "en-US",
				filename,
			});
			for (const message of Object.values(catalog)) {
				const translations =
					typeof message.translation === "string" ? [message.translation] : Object.values(message.translation ?? {});
				for (const translation of translations)
					expect(translation, `${app}/${filename}`).not.toMatch(/Master[ -]?CV|Reactive Resume|ماستر(?: سي في)?/i);
			}
		}
	}
});
