import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createResumePdfFile } from "../server";

const clean = (text: string) =>
	text
		.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "")
		.replace(/\s+/gu, " ")
		.replace(/\s*([/-])\s*/gu, "$1")
		.trim();

const cases = [
	["year", "٢٠٢٤", "2024"],
	["date", "٠١/٠٢/٢٠٢٤", "01/02/2024"],
	["hijri", "١٤٤٥ هـ - ١٤٤٦ هـ", "1445 هـ - 1446 هـ"],
	["single-hijri", "١٤٤٥ هـ", "1445 هـ"],
	["persian", "۰۱/۰۲/۲۰۲۴", "01/02/2024"],
	["range", "٢٠٢٠ – ٢٠٢٢", "2020-2022"],
	["labelled", "من ٢٠٢٠ إلى ٢٠٢٤", "من 2020 إلى 2024"],
	["latin", "2020 – 2022", "2020-2022"],
	["month-range", "08/1999 - 12/2003", "08/1999-12/2003"],
	["descending", "2019 - 2015", "2019-2015"],
	["ongoing-ar", "2015 - حتى الآن", "2015 - حتى الآن"],
	["ongoing-en", "2015 - Present", "2015 - Present"],
] as const;

it.each(
	cases.flatMap((entry) =>
		(/(?:hijri|labelled|ongoing-ar)/u.test(entry[0]) ? ["ar-SA"] : ["ar-SA", "en-US"]).map(
			(locale) => [...entry, locale] as const,
		),
	),
)(
	"preserves the %s date (%s → %s, %s) in both readers without editing data",
	{ timeout: 60000 },
	async (id, raw, expected, locale) => {
		const data = structuredClone(defaultResumeData);
		data.picture.hidden = true;
		data.basics.name = locale === "ar-SA" ? "أحمد العتيبي" : "Ahmed Alotaibi";
		data.metadata.template = "onyx";
		data.metadata.page.locale = locale;
		data.metadata.page.hideIcons = true;
		if (locale === "ar-SA") {
			data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
			data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
		} else {
			data.metadata.typography.body.fontFamily = "Noto Sans";
			data.metadata.typography.heading.fontFamily = "Noto Sans";
		}
		data.metadata.layout.pages = [{ fullWidth: true, main: ["projects"], sidebar: [] }];
		data.sections.projects.items = [
			{
				id: "project",
				hidden: false,
				name: locale === "ar-SA" ? "مشروع التقويم" : "Calendar project",
				period: raw,
				dates: { start: null, end: null, present: false, raw },
				website: { url: "", label: "", inlineLink: false },
				description: "",
			},
		];
		const snapshot = structuredClone(data);
		const file = await act(() => createResumePdfFile({ data, filename: "numeric.pdf" }));
		const bytes = new Uint8Array(await file.arrayBuffer());
		const poppler = execFileSync("pdftotext", ["-enc", "UTF-8", "-", "-"], { input: bytes, encoding: "utf8" });
		const task = getDocument({ data: bytes.slice() });
		let pdfjs = "";
		try {
			const doc = await task.promise;
			for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
				const page = await doc.getPage(pageNumber);
				const content = await page.getTextContent({ disableNormalization: true });
				pdfjs += content.items
					.flatMap((item) => ("str" in item ? [item.str + (item.hasEOL ? "\n" : "")] : []))
					.join("");
			}
		} finally {
			await task.destroy();
		}
		if (process.env.NUMERIC_BIDI_EVIDENCE) {
			await mkdir(process.env.NUMERIC_BIDI_EVIDENCE, { recursive: true });
			await writeFile(join(process.env.NUMERIC_BIDI_EVIDENCE, `${id}-${locale}.pdf`), bytes, { flag: "wx" });
			await writeFile(
				join(process.env.NUMERIC_BIDI_EVIDENCE, `${id}-${locale}.json`),
				JSON.stringify({ raw, pdfjs, poppler }, null, 2),
				{ flag: "wx" },
			);
		}
		expect(data).toEqual(snapshot);
		for (const [reader, text] of [
			["PDF.js", pdfjs],
			["Poppler", poppler],
		] as const) {
			if (/^(?:range|latin|month-range|descending)$/u.test(id)) {
				// The compact number run must survive without repairing reader whitespace.
				expect.soft(text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, ""), reader).toContain(expected);
				expect.soft(clean(text), reader).toContain(locale === "ar-SA" ? "مشروع التقويم" : "Calendar project");
			} else if (/ongoing/u.test(id) || (reader === "Poppler" && /hijri|labelled/u.test(id))) {
				// D32: Poppler loses spacing around Arabic suffixes/labels; every value and label must survive.
				for (const token of expected.split(/[\s-]+/u).filter(Boolean)) {
					expect.soft(clean(text), reader).toContain(token);
				}
			} else expect.soft(clean(text), reader).toContain(clean(expected));
		}
	},
);
