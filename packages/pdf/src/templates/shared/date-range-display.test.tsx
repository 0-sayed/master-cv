import { expect, it } from "vite-plus/test";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { getPresentLabel } from "@reactive-resume/schema/resume/dates";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";
import { renderHostTree } from "../../forme/reconciler";
import { toFormeDocument } from "../../forme/to-forme";
import { dateDisplay } from "./date-display";

it.each(
	(["ar-SA", "en-US"] as const).flatMap((locale) =>
		(["short", "long", "numeric", "iso"] as const).map((format) => [locale, format] as const),
	),
)("exports month endpoints without changing saved dates in %s / %s", (locale, format) => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.metadata.page.locale = locale;
	data.metadata.page.dateFormat = format;
	data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
	data.sections.projects.items = [
		{
			id: "numeric",
			hidden: false,
			name: "Numeric range",
			period: "",
			description: "",
			dates: { start: "2020-03", end: "2021-05", present: false },
			website: { url: "", label: "", inlineLink: false },
		},
	];
	const input = parseResumeData(data);
	const snapshot = structuredClone(input);
	const doc = JSON.stringify(toFormeDocument(renderHostTree(<ResumeDocument data={input} template="onyx" />)).document);
	if (locale === "ar-SA") {
		expect(doc).toContain("03/2020");
		expect(doc).toContain("05/2021");
		expect(doc.replace(/[\u2066-\u2069]/gu, "")).toContain("03/2020 - 05/2021");
	} else expect(doc).toContain(input.sections.projects.items[0]?.period);
	expect(input).toEqual(snapshot);
});

for (const locale of ["ar-SA", "en-US"])
	it(`keeps the localized ongoing label as a single display token in ${locale}`, () => {
		const label = getPresentLabel(locale);
		expect(dateDisplay(`2020 – ${label}`, locale)).toEqual(
			locale === "ar-SA" ? { text: `2020 - ${label}` } : { text: `2020 – ${label}` },
		);
	});
it("keeps the source-authored حالياً ongoing label in a single token", () => {
	expect(dateDisplay("2020-حالياً", "ar-SA")).toEqual({ text: "2020 - حالياً" });
	expect(dateDisplay("03/2020-حالياً", "ar-SA")).toEqual({ text: "03/2020 - حالياً" });
});
it.each(["1445 هـ - 1446 هـ", "من 2020 إلى 2024", "Mar 2020 – May 2021", "Summer 2020"])(
	"preserves labelled dates and precision: %s",
	(value) => {
		expect(dateDisplay(value, "ar-SA")).toEqual({ text: value });
	},
);

it.each(["ar-SA", "en-US"])("D33 scopes year-range display to document locale %s", (locale) => {
	expect(dateDisplay("2015 – 2017", locale)).toEqual(
		locale === "ar-SA" ? { text: "2015 - 2017" } : { text: "2015 – 2017" },
	);
});
