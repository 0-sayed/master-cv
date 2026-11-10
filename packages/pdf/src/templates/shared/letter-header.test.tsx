import type { Template } from "@reactive-resume/schema/templates";
import { describe, expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCoverLetterResumeData } from "@reactive-resume/resume/cover-letter";
import { createSampleResumeData } from "@reactive-resume/schema/resume/sample";
import { renderResume } from "../../forme/render";

// English extraction/geometry fixtures must not inherit the product sample's Arabic default.
const sampleResumeData = createSampleResumeData(undefined, "en-US");

const letterIn = (template: Template) => {
	const { notes: _notes, layout: _layout, ...metadata } = { ...sampleResumeData.metadata, template };
	return createCoverLetterResumeData({
		name: "Letter",
		recipient: "<p>Hiring Manager</p>",
		content: "<p>Dear team, I would like to apply.</p>",
		style: {
			basics: sampleResumeData.basics,
			picture: { ...sampleResumeData.picture, hidden: true },
			metadata,
			sectionId: "letter",
			itemId: "letter-item",
		},
	});
};

describe("letters", () => {
	// A letter's page is full width; templates that keep their header in the sidebar still print it.
	it.each(["gengar"] as const)("prints the sender's header in %s", { timeout: 60_000 }, async (template) => {
		const { pdf } = await renderResume(forme, {
			data: letterIn(template),
			template,
			renderOptions: { includeCoverLetterHeader: true },
		});
		const document = await getDocument({ data: pdf }).promise;
		const text = (await (await document.getPage(1)).getTextContent()).items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ");

		expect(text).toContain(sampleResumeData.basics.name);
		expect(text).toContain("Dear team");
	});
});
