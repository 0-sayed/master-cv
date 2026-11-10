import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { formatter } from "@lingui/format-po";

it("Arabic action labels are translated actions rather than inherited present-tense verbs", async () => {
	const source = await readFile(new URL("../../apps/web/locales/ar-SA.po", import.meta.url), "utf8");
	const catalog = await formatter().parse(source, { locale: "ar-SA", sourceLocale: "en-US", filename: "ar-SA.po" });
	const actions = Object.values(catalog).filter((message) =>
		/^(?:Change(?: password)?|Delete(?: account)?|Export|Save|Add|Keep|Check)(?:…|\.\.\.)?$/u.test(
			message.message ?? "",
		),
	);
	for (const action of ["Change", "Delete", "Export", "Save", "Add", "Keep", "Check"])
		expect(
			actions.some((entry) => entry.message?.startsWith(action)),
			action,
		).toBe(true);
	for (const entry of actions) {
		expect(entry.translation, entry.message).toBeTruthy();
		expect(entry.translation, entry.message).not.toMatch(/^(?:يتغير|يمسح|يصدر|يحفظ|يضيف|Check)(?:…|\.\.\.)?$/u);
	}
});
