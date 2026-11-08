import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createResumePdfFile } from "../server";

const clean = (text: string) => text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "");

// D33: closed and ongoing endpoints must read naturally in the RTL document, beside either role language.
it.each(["bronzor", "onyx", "azurill"] as const)(
	"places the start to the right of Arabic range endpoints, retaining entry text: %s",
	async (template) => {
		for (const title of ["مهندس نظم", "Document Engineer"]) {
			for (const [start, label] of [
				["2016", "2019"],
				["08/1999", "12/2003"],
				["2015", "حتى الآن"],
				["08/2015", "حتى الآن"],
				["2015", "حالياً"],
				["08/2015", "حالياً"],
				["08/2015", "حاليا"],
				["2015", "الآن"],
				["08/2015", "الحاضر"],
			]) {
				assert(start && label);
				const data = structuredClone(defaultResumeData);
				data.picture.hidden = true;
				data.metadata.template = template;
				data.metadata.page.locale = "ar-SA";
				data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
				data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
				data.metadata.layout.pages = [{ fullWidth: true, main: ["experience"], sidebar: [] }];
				data.sections.experience.items = [
					{
						id: "job",
						hidden: false,
						company: "شركة الوثائق",
						position: "",
						period: "",
						location: "",
						description: "",
						website: { url: "", label: "", inlineLink: false },
						roles: [
							{
								id: "ongoing",
								position: title,
								period: `${start}-${label}`,
								dates: { start: null, end: null, present: false, raw: `${start}-${label}` },
								description: "",
							},
						],
					},
				];
				const snapshot = structuredClone(data);
				const file = await act(() => createResumePdfFile({ data, filename: "ongoing.pdf" }));
				const bytes = new Uint8Array(await file.arrayBuffer());
				const poppler = clean(execFileSync("pdftotext", ["-layout", "-", "-"], { input: bytes, encoding: "utf8" }));
				const expectedLabel = label === "حالياً" ? "حاليا" : label;
				expect
					.soft(
						poppler
							.split("\n")
							.some((line) => line.includes(start) && line.includes(expectedLabel) && line.includes(title)),
						"Poppler same role line",
					)
					.toBe(true);
				const task = getDocument({ data: bytes.slice() });
				try {
					const document = await task.promise;
					const page = await document.getPage(1);
					const ops = await page.getOperatorList();

					const glyphs: { text: string; xMax: number; y: number }[] = [];
					let x = 0;
					let y = 0;
					let lineX = 0;
					let lineY = 0;
					let fontSize = 0;
					let spacing = 0;
					for (let i = 0; i < ops.fnArray.length; i++) {
						const args = ops.argsArray[i];
						switch (ops.fnArray[i]) {
							case OPS.beginText:
								x = 0;
								y = 0;
								lineX = 0;
								lineY = 0;
								break;
							case OPS.setFont:
								fontSize = args[1];
								break;
							case OPS.setCharSpacing:
								spacing = args[0];
								break;
							case OPS.moveText:
								lineX += args[0];
								lineY += args[1];
								x = lineX;
								y = lineY;
								break;
							// Forme emits absolute glyph positions with Td, without text/graphics transforms.
							case OPS.transform:
							case OPS.setTextMatrix:
								throw new Error("Update glyph-position reader for transformed text");
							case OPS.showText:
								for (const glyph of args[0] as ({ unicode: string; width: number } | number)[]) {
									if (typeof glyph === "number") x -= (glyph * fontSize) / 1000;
									else {
										x += (glyph.width * fontSize) / 1000 + spacing;
										glyphs.push({ text: glyph.unicode, xMax: x, y });
									}
								}
								break;
						}
					}
					const painted = glyphs.map((glyph) => glyph.text).join("");
					const yearIndex = painted.indexOf(start);
					assert(yearIndex >= 0);
					// Find glyph offsets by text length (Arabic ligatures can contain several Unicode characters).
					let offset = 0;
					const year = glyphs.find((glyph) => {
						const end = offset + glyph.text.length;
						const match = offset <= yearIndex + start.length - 1 && end > yearIndex + start.length - 1;
						offset = end;
						return match;
					});
					assert(year);
					const paintedLine = glyphs
						.filter((glyph) => Math.abs(glyph.y - year.y) < 1)
						.sort((a, b) => a.xMax - b.xMax)
						.map((glyph) => glyph.text)
						.join("");
					expect.soft(paintedLine, "painted endpoint stays contiguous beside its hyphen").toContain(` - ${start}`);
					// The labels start with ح or ا; neither occurs in the synthetic role titles.
					let labelOffset = 0;
					const labelIndex = /^\d/u.test(label) ? painted.indexOf(label) : -1;
					const labelGlyph = glyphs.filter((glyph) => {
						const end = labelOffset + glyph.text.length;
						const matches =
							labelIndex >= 0
								? labelOffset < labelIndex + label.length && end > labelIndex
								: glyph.text === (label.startsWith("ا") ? "ا" : "ح");
						labelOffset = end;
						return matches && Math.abs(glyph.y - year.y) < 1;
					});
					assert(labelGlyph.length > 0);
					expect
						.soft(year.xMax, `${title} / ${start}-${label}: year right of label`)
						.toBeGreaterThan(Math.max(...labelGlyph.map((glyph) => glyph.xMax)));
					const content = await page.getTextContent({ disableNormalization: true });
					const items = content.items.filter((item) => "str" in item);

					const date = items.find((item) => item.str.includes(start.split("/").at(-1) ?? start));
					assert(date);
					const line = clean(
						items
							.filter((item) => Math.abs(item.transform[5] - date.transform[5]) < 1)
							.map((item) => item.str)
							.join(""),
					);
					// PDF.js can reorder MM/YYYY pieces within this RTL entry; glyphs above prove their visual order.
					for (const part of start.split("/")) expect.soft(line, "PDF.js same role line").toContain(part);
					for (const part of expectedLabel.split("/")) expect.soft(line, "PDF.js same role line").toContain(part);
					expect.soft(line, "PDF.js same role line").toContain(title);
				} finally {
					await task.destroy();
				}
				expect(data).toEqual(snapshot);
			}
		}
	},
);
