import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";

async function catalog(locale: "ar-SA" | "en-US") {
	return formatter().parse(await readFile(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"), {
		locale,
		sourceLocale: "en-US",
		filename: `${locale}.po`,
	});
}

it("uses English source identities and complete English/Arabic interface catalogs", async () => {
	for (const locale of ["en-US", "ar-SA"] as const) {
		const active = Object.values(await catalog(locale)).filter((message) => !message.obsolete);
		expect(active.filter((message) => !message.translation?.trim()).map((message) => message.message)).toEqual([]);
		expect(active.filter((message) => /\p{Script=Arabic}/u.test(message.message ?? ""))).toEqual([]);
		if (locale === "en-US")
			expect(active.filter((message) => /\p{Script=Arabic}/u.test(message.translation ?? ""))).toEqual([]);
	}
});

it("localizes audited labels while preserving product names and CSV separators", async () => {
	const messages = Object.values(await catalog("ar-SA"));
	for (const source of ["Edited text", "Your information", "Loading", "Template not found", "Markdown (.md)"])
		expect(messages.find((message) => message.message === source)?.translation, source).toMatch(/\p{Script=Arabic}/u);
	expect(messages.find((message) => message.context?.startsWith("US Letter paper size"))?.translation).toBe(
		"مقاس Letter الأمريكي",
	);
	expect(messages.find((message) => message.message === "Company,Role,Stage,…")?.translation).toBe(
		"الشركة,الوظيفة,المرحلة,…",
	);
	for (const name of ["Claude Desktop", "Fieldnote", "Figma", "WCAG 2.1 AA"])
		expect(messages.find((message) => message.message === name)?.translation, name).toBe(name);
});
