import { describe, expect, it } from "vite-plus/test";
import { i18n, setupI18n } from "@lingui/core";
import { ATS_RULE_CODES } from "@reactive-resume/resume/ats";
import { getEditorFindingMessage } from "./messages";
import { getPdfFindingMessage } from "@/features/ats-checker/messages";
import { getUiLocaleMessages } from "@/libs/locale";

const params = {
	value: "bad",
	url: "example.com",
	entry: "Example entry",
	name: "Experience",
	names: "Skills, Education",
	title: "Experience",
	page: "1",
	minimum: 9,
	hasScheme: false,
};
describe("reusable finding messages", () => {
	it.each([
		["en-US", "Very little text was extracted per page on average."],
		["ar-SA", "استُخرج القليل جدًا من النص لكل صفحة في المتوسط."],
	] as const)("describes sparse extracted text without assuming content is missing in %s", async (locale, expected) => {
		const translator = setupI18n({ locale, messages: { [locale]: (await getUiLocaleMessages(locale)).messages } });
		expect(getPdfFindingMessage("LOW_TEXT_DENSITY", translator).why).toBe(expected);
	});
	it("uses independent translators without changing the active locale", async () => {
		const activeLocale = i18n.locale;
		const translators = await Promise.all(
			(["ar-SA", "en-US"] as const).map(async (locale) =>
				setupI18n({ locale, messages: { [locale]: (await getUiLocaleMessages(locale)).messages } }),
			),
		);
		const ar = getEditorFindingMessage("MISSING_EMAIL", params, translators[0]);
		const en = getEditorFindingMessage("MISSING_EMAIL", params, translators[1]);
		for (const translator of translators) {
			for (const code of ATS_RULE_CODES) {
				const message = getEditorFindingMessage(code, params, translator);
				expect(Object.keys(message).sort()).toEqual(["action", "body", "title"]);
				expect(Object.values(message).every((value) => typeof value === "string" && value.length > 0)).toBe(true);
			}
			expect(getEditorFindingMessage("MALFORMED_URL", { ...params, hasScheme: true }, translator).action).not.toBe(
				getEditorFindingMessage("MALFORMED_URL", params, translator).action,
			);
		}
		expect(i18n.locale).toBe(activeLocale);
		expect(en).toEqual({
			title: "Add an email address",
			body: "An email gives recruiters a way to reach you.",
			action: "Add an email",
		});
		expect(ar.title).not.toBe(en.title);
		expect(Object.values(ar).every((value) => typeof value === "string")).toBe(true);
		expect(getPdfFindingMessage("NO_EMAIL", translators[0]).title).not.toBe(
			getPdfFindingMessage("NO_EMAIL", translators[1]).title,
		);
	});
});
