import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { buildExtractedDocument, harvestPdfDocument } from "@reactive-resume/resume/ats-pdf";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { renderResume } from "./render";

// Reuses the independent review's seven-entry fixture, including repeated/descending dates,
// a wrapped title and prose. Expectations are literal, independent of display helpers.
it.each(
	(["onyx", "bronzor", "azurill", "gengar"] as const).flatMap((template) =>
		["ar-SA", "en-US"].map((locale) => [template, locale] as const),
	),
)("keeps closed ranges intact through real readers: %s / %s", { timeout: 120000 }, async (template, locale) => {
	const data = structuredClone(defaultResumeData);
	data.picture.hidden = true;
	data.basics.name = locale === "ar-SA" ? "أحمد الوثائق" : "Ahmed Documents";
	data.metadata.template = template;
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
		["مهندس وثائق", "2015–2019", "طورت أنظمة آمنة لتحليل البيانات."],
		["Platform Engineer", "08/1999 - 12/2003", "Built things."],
		["مشروع حالي", "2017 - حتى الآن", ""],
		["Present Project", "2018 - Present", ""],
		["محلل نظم", "2015–2019", "نفس التواريخ مرة أخرى."],
		[
			"مهندس برمجيات أول ومدير فريق تطوير المنصات الرقمية والخدمات الحكومية الإلكترونية المتكاملة في المملكة العربية السعودية",
			"2020 - 2021",
			"عملت في مشروع التقويم 2008 - 2011.",
		],
		["محلل", "2014 - 2010", "ترتيب تنازلي مقصود"],
	].map(([name, raw, description], index) => {
		assert(name && raw !== undefined);
		const english = [
			["Document Engineer", "Built secure data analysis systems."],
			["Platform Engineer", "Built things."],
			["Current Project", ""],
			["Present Project", ""],
			["Systems Analyst", "The same dates again."],
			[
				"Senior Software Engineer and Team Lead for Integrated Digital Platforms and Government Services across the Kingdom of Saudi Arabia",
				"Worked on calendar project 2008 - 2011.",
			],
			["Analyst", "Intentionally authored descending range"],
		][index];
		assert(english?.[0] && english[1] !== undefined);
		const displayName = locale === "en-US" ? english[0] : name;
		const prose = locale === "en-US" ? english[1] : description;
		return {
			id: `project-${index}`,
			hidden: false,
			name: displayName,
			period: raw,
			dates: { start: null, end: null, present: false, raw },
			website: { url: "", label: "", inlineLink: false },
			description: prose ? `<p>${prose}</p>` : "",
		};
	});
	const snapshot = structuredClone(data);
	const directory = process.env.DATE_READER_EVIDENCE ?? (await mkdtemp(join(tmpdir(), "cv-date-readers-")));
	await mkdir(directory, { recursive: true });
	const filename = join(directory, `${template}-${locale}.pdf`);
	const rendered = await act(() => renderResume(forme, { data: parseResumeData(data) }));
	await writeFile(filename, rendered.pdf);
	const expected = ["2015-2019", "08/1999-12/2003", "2020-2021", "2008-2011", "2014-2010"];
	const task = getDocument({ data: rendered.pdf.slice() });
	try {
		const document = await task.promise;
		const raw = await harvestPdfDocument(document, {
			file: { name: "dates.pdf", sizeBytes: rendered.pdf.length, magicBytesOk: true },
			operatorBudgetMs: 0,
		});
		const texts = new Map([["checker geometry", buildExtractedDocument(raw).fullText]]);
		let stream = "";
		for (let number = 1; number <= document.numPages; number++) {
			const page = await document.getPage(number);
			const content = await page.getTextContent({ disableNormalization: true });
			stream += content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join("");
		}
		texts.set("PDF.js", stream);
		texts.set("Poppler", execFileSync("pdftotext", ["-enc", "UTF-8", filename, "-"], { encoding: "utf8" }));
		for (const [reader, text] of texts) {
			const clean = text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "");
			for (const value of expected) expect.soft(clean, `${reader}: ${value}`).toContain(value);
			expect.soft(clean.match(/2015-2019/gu), `${reader}: repeated range`).toHaveLength(2);
		}
		const result = execFileSync(
			process.env.DATE_READER_PYTHON ?? "python3",
			[fileURLToPath(new URL("../../scripts/check-date-readers.py", import.meta.url)), filename, ...expected],
			{ encoding: "utf8", timeout: 90000 },
		);
		console.info(`${template} / ${locale}\n${result}`);
	} finally {
		await task.destroy();
		if (!process.env.DATE_READER_EVIDENCE) await rm(directory, { recursive: true, force: true });
	}
	expect(data).toEqual(snapshot);
});
