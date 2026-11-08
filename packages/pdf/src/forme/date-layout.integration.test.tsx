import type { ElementInfo } from "@formepdf/core";
import assert from "node:assert/strict";
import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { act } from "react";
import { parseResumeData } from "@reactive-resume/schema/resume/data";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { templateSchema } from "@reactive-resume/schema/templates";
import { renderResume } from "./render";

for (const language of ["ar", "mixed", "en"] as const)
	it.each(templateSchema.options)(`keeps short date rows on one rendered line in ${language}: %s`, async (template) => {
		const data = structuredClone(defaultResumeData);
		data.picture.hidden = true;
		data.metadata.template = template;
		data.metadata.page.locale = language === "en" ? "en-US" : "ar-SA";
		const titles: [string, string, string, string] =
			language === "en"
				? ["Document Engineer", "Document Reviewer", "Calendar Project", "Records Project"]
				: [language === "mixed" ? "Platform Engineer" : "مهندس وثائق", "مراجع وثائق", "مشروع قمر", "مشروع شمس"];
		data.metadata.page.dateFormat = "numeric";
		data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
		data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
		data.metadata.layout.pages = [{ fullWidth: true, main: ["experience", "projects"], sidebar: [] }];
		const website = { url: "", label: "", inlineLink: false };
		data.sections.experience.items = [
			{
				id: "job",
				hidden: false,
				company: "شركة الوثائق",
				position: "",
				period: "",
				location: "",
				description: "",
				website,
				roles: [
					{
						id: "ongoing",
						position: titles[0],
						period: "",
						description: "",
						dates: { start: "2015", end: null, present: true },
					},
					{
						id: "month",
						position: titles[1],
						period: "",
						description: "",
						dates: { start: "2020-03", end: "2021-05", present: false },
					},
				],
			},
		];
		data.sections.projects.items = [
			[titles[2], "1440 هـ - 1441 هـ"],
			[titles[3], "من 2009 إلى 2011"],
		].map(([name, period], i) => {
			assert(name && period);
			return {
				id: `project-${i}`,
				hidden: false,
				name,
				period,
				description: "",
				website,
			};
		});
		const snapshot = structuredClone(data);
		const result = await act(() => renderResume(forme, { data: parseResumeData(data) }));
		const paragraphs: ElementInfo[] = [];
		const walk = (node: ElementInfo) => {
			if (node.children.some((child) => child.nodeType === "TextLine")) paragraphs.push(node);
			node.children.forEach(walk);
		};
		result.layout.pages.forEach((page) => page.elements.forEach(walk));
		for (const [title, date] of [
			[titles[0], "2015"],
			[titles[1], "03/2020"],
			[titles[2], "1440"],
			[titles[3], "2009"],
		] as const) {
			const paragraph = paragraphs.find((node) =>
				node.children.some(
					(line) => line.textContent?.includes(title) || line.textContent?.includes([...title].reverse().join("")),
				),
			);
			assert(paragraph, title);
			const lines = paragraph.children.filter((child) => child.nodeType === "TextLine");
			const firstLine = lines[0];
			assert(firstLine);
			expect.soft(lines, `${title}: ${lines.map((line) => line.textContent).join(" / ")}`).toHaveLength(1);
			if (language === "en") {
				// Upstream English keeps independent cells on the same physical line.
				expect
					.soft(
						paragraphs.some((node) =>
							node.children.some(
								(line) =>
									line.nodeType === "TextLine" &&
									line.textContent?.includes(date) &&
									Math.abs(line.y - firstLine.y) < 0.5,
							),
						),
						title,
					)
					.toBe(true);
			} else expect.soft(lines[0]?.textContent, title).toContain(date);
		}
		expect(data).toEqual(snapshot);
	});
