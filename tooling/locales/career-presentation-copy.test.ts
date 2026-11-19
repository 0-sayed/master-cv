import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { setupI18n } from "@lingui/core";
import { compileMessageOrThrow } from "@lingui/message-utils/compileMessage";

const deck = JSON.parse(readFileSync(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"));
it.each([0, 1, 2, 3, 11, 100])("formats career CV counts for %s in both locales with Latin digits", (count) => {
	const entry = deck.entries.find((entry: { key: string }) => entry.key === "editor.field.usageCount");
	for (const locale of ["ar-SA", "en-US"]) {
		const instance = setupI18n({
			locale,
			messages: { [locale]: { usage: compileMessageOrThrow(entry.messages[locale]) } },
		});
		const text = instance._("usage", { count, countLabel: String(count) });
		expect(text).not.toMatch(/[٠-٩]/);
		expect(text).not.toContain("{");
		expect(text.length).toBeGreaterThan(3);
		if (locale === "en-US") expect(text).toBe(`In ${count} CV${count === 1 ? "" : "s"}`);
	}
});
