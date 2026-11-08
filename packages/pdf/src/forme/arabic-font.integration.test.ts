import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vite-plus/test";
import * as forme from "@formepdf/core";
import { Document, Page, Text, serialize } from "@formepdf/react";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createElement } from "react";
import { getWebFontSource } from "@reactive-resume/fonts";
import { createFontPreparer, createFontSubsetter } from "./font-subset";
import { readServerFont } from "./fonts.node";

const words = "شركة الأفق مهندس برمجيات جامعة الملك سعود";
const require = createRequire(import.meta.url);

it.each(["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const)(
	"preserves Arabic words in PDF.js with the default Noto Sans Arabic %s face, full and subset",
	{ timeout: 60000 },
	async (weight) => {
		const source = getWebFontSource("Noto Sans Arabic", weight);
		expect(source).toBeTruthy();
		if (!source) throw new Error("Noto Sans Arabic source is missing");
		const bytes = await readServerFont(source);
		const subset = await createFontSubsetter(readFileSync(require.resolve("harfbuzzjs/dist/harfbuzz-subset.wasm")));
		for (const subsetter of [null, subset]) {
			const tree = createElement(
				Document,
				{ fonts: [{ family: "Probe", fontWeight: Number(weight), src: createFontPreparer(subsetter)(bytes, words) }] },
				createElement(
					Page,
					{ size: "A4", margin: 30 },
					createElement(
						Text,
						{ style: { fontFamily: "Probe", fontWeight: Number(weight), direction: "rtl", fontSize: 16 } },
						words,
					),
				),
			);
			const pdf = await forme.renderSerializedDoc({ ...serialize(tree) });
			const poppler = execFileSync("pdftotext", ["-enc", "UTF-8", "-", "-"], { input: pdf, encoding: "utf8" });
			for (const word of words.split(" ")) expect(poppler).toContain(word);
			const task = getDocument({ data: pdf.slice() });
			try {
				const page = await (await task.promise).getPage(1);
				const content = await page.getTextContent({ disableNormalization: true });
				const text = content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" ");
				for (const word of words.split(" ")) expect(text).toContain(word);
			} finally {
				await task.destroy();
			}
		}
	},
);
