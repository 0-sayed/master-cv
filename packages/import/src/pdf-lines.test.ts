import type { ExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import assert from "node:assert/strict";
import { expect, it } from "vite-plus/test";
import { documentToLines } from "./pdf-lines";

function document(rtl: boolean, columns = false): ExtractedDocument {
	const spans = [
		{ text: rtl ? "الأفق" : "Horizon", x: 100, width: 40, dir: rtl ? ("rtl" as const) : ("ltr" as const) },
		{ text: rtl ? "شركة" : "Systems", x: 145, width: 30, dir: rtl ? ("rtl" as const) : ("ltr" as const) },
	].map((span, streamIndex) => ({ ...span, y: 10, height: 10, fontSize: 10, fontRef: "font", streamIndex }));
	const lines = [
		{
			text: "",
			spans,
			x: 100,
			y: 10,
			width: 75,
			height: 10,
			page: 1,
			fontSize: 10,
			fontRef: "font",
			meanStreamIndex: 0,
		},
	];
	const page = {
		pageNumber: 1,
		width: 595,
		height: 842,
		lines,
		inversionRatio: 0,
		gutter: columns ? { x: 140, width: 5, coverage: 1, splitRatio: 0.5 } : null,
		margins: { top: 10, bottom: 10, left: 10, right: 10 },
		textAreaRatio: 0.1,
	};
	return {
		pages: [page],
		lines,
		fullText: "",
		charCount: 0,
		wordCount: 0,
		modalFontSize: 10,
		modalFontRef: "font",
		distinctFontRefs: 1,
	};
}
it("joins split RTL runs in logical order without reversing characters", () => {
	expect(documentToLines(document(true))).toEqual(["شركة الأفق"]);
	expect(documentToLines(document(false))).toEqual(["Horizon Systems"]);
});
it("reads RTL columns right first while retaining English left-first order", () => {
	expect(documentToLines(document(true, true))).toEqual(["شركة", "الأفق"]);
	expect(documentToLines(document(false, true))).toEqual(["Horizon", "Systems"]);
});

it("does not let a longer numeric date override an Arabic row", () => {
	const doc = document(true);
	const row = doc.pages[0]?.lines[0];
	const date = row?.spans[0];
	const role = row?.spans[1];
	assert(date && role);
	date.text = "2020 - 2022";
	date.dir = "ltr";
	role.text = "مهندس";
	expect(documentToLines(doc)).toEqual(["مهندس 2020 - 2022"]);
});

it("uses declared document direction for columns containing long Latin contacts", () => {
	const doc = document(true, true);
	Object.assign(doc, { direction: "rtl" });
	const contact = doc.pages[0]?.lines[0]?.spans[0];
	assert(contact);
	contact.text = "very.long.synthetic.contact@example.test";
	contact.dir = "ltr";
	expect(documentToLines(doc)[0]).toBe("شركة");
});

it.each([true, false])("keeps vertically separated header/body bands in page order (RTL=%s)", (rtl) => {
	const doc = document(rtl, true);
	const page = doc.pages[0];
	const first = page?.lines[0];
	const left = first?.spans[0];
	const right = first?.spans[1];
	assert(page && first && left && right);
	const header = { ...left, text: "Header", y: 10 };
	const body = { ...right, text: "Body", y: 40 };
	page.lines = [
		{ ...first, spans: [header], y: 10 },
		{ ...first, spans: [body], y: 40 },
	];
	Object.assign(doc, { direction: rtl ? "rtl" : "ltr" });
	expect(documentToLines(doc)).toEqual(["Header", "Body"]);
});

it.each([true, false])("reads staggered real columns as complete columns (RTL=%s)", (rtl) => {
	const left = ["Skills", "TypeScript", "PostgreSQL", "React", "Docker", "Linux"];
	const right = ["Experience", "Engineer", "Horizon Labs", "2021 - 2024", "Built software", "Led delivery"];
	const doc = document(rtl, true);
	const page = doc.pages[0];
	const first = page?.lines[0];
	const span = first?.spans[0];
	assert(page && first && span);
	// Both columns occupy the same page region, but their 10pt rows are offset by 15pt.
	page.gutter = { x: 120, width: 210, coverage: 1, splitRatio: 0.5 };
	page.lines = left.flatMap((text, index) =>
		[text, right[index]].map((value, side) => {
			assert(value);
			const y = 60 + index * 30 + side * 15;
			return {
				...first,
				y,
				spans: [{ ...span, text: value, x: side === 0 ? 50 : 330, width: 70, y, height: 10 }],
			};
		}),
	);
	Object.assign(doc, { direction: rtl ? "rtl" : "ltr" });
	expect(documentToLines(doc)).toEqual(rtl ? [...right, ...left] : [...left, ...right]);
});
