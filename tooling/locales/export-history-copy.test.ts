import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
import { formatter } from "@lingui/format-po";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";

type Entry = { key: string; messages: Record<"ar-SA" | "en-US", string>; lingui: { runtimeId: string } };
const deck = JSON.parse(
	readFileSync(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
) as { entries: Entry[] };

it("compiles export/history recovery copy in both active catalogs without changing saved content", async () => {
	const entries = deck.entries.filter(
		(entry) => entry.key.startsWith("editor.exportHistory.") || entry.key === "workspace.cv.Tz7hl8",
	);
	expect(entries.length).toBeGreaterThanOrEqual(27);
	for (const locale of ["ar-SA", "en-US"] as const) {
		const catalog = await formatter().parse(
			readFileSync(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url), "utf8"),
			{ locale, sourceLocale: "en-US", filename: `${locale}.po` },
		);
		for (const entry of entries) {
			const instance = setupI18n({
				locale,
				messages: { [locale]: { message: compileMessageOrThrow(entry.messages[locale]) } },
			});
			const content = "Synthetic سيرة user content";
			const rendered = instance._("message", { title: content, moment: "18 Nov 2026", label: "PDF", 0: "18 Nov 2026" });
			expect(rendered).not.toMatch(/[٠-٩]|\{(?:title|moment|label|0)\}/);
			if (entry.key.endsWith("restoreTitle")) expect(rendered).toContain(content);
			expect(catalog[entry.lingui.runtimeId]?.translation).toBe(entry.messages[locale]);
		}
	}
});
