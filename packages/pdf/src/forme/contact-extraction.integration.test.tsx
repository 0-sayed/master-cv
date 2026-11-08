import { execFileSync } from "node:child_process";
import { expect, it } from "vite-plus/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createResumePdfFile } from "../server";

const clean = (value: string) => value.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ");

it.each(["onyx", "glalie", "azurill"] as const)(
	"extracts the complete LTR phone beside Arabic contacts in both readers: %s",
	async (template) => {
		for (const hideIcons of [true, false]) {
			for (const phone of ["+966 50 123 4567", "+٩٦٦ ٥٠ ١٢٣ ٤٥٦٧", "+۹۶۶ ۵۰ ۱۲۳ ۴۵۶۷"]) {
				const data = structuredClone(defaultResumeData);
				data.picture.hidden = true;
				data.basics.name = "أحمد العتيبي";
				data.basics.phone = phone;
				data.basics.email = "synthetic@example.test";
				data.basics.location = "الرياض";
				data.metadata.template = template;
				data.metadata.page.locale = "ar-SA";
				data.metadata.page.hideIcons = hideIcons;
				data.metadata.typography.body.fontFamily = "Noto Sans Arabic";
				data.metadata.typography.heading.fontFamily = "Noto Sans Arabic";
				const snapshot = structuredClone(data);
				const file = await act(() => createResumePdfFile({ data, filename: "contact.pdf" }));
				const bytes = new Uint8Array(await file.arrayBuffer());
				const poppler = execFileSync("pdftotext", ["-enc", "UTF-8", "-", "-"], { input: bytes, encoding: "utf8" });
				const task = getDocument({ data: bytes.slice() });
				try {
					const document = await task.promise;
					const page = await document.getPage(1);
					const content = await page.getTextContent({ disableNormalization: true });
					const pdfjs = content.items
						.flatMap((item) => ("str" in item ? [item.str + (item.hasEOL ? "\n" : "")] : []))
						.join("");
					expect.soft(clean(pdfjs), `PDF.js / ${hideIcons} / ${phone}`).toContain("+966 50 123 4567");
					expect.soft(clean(poppler), `Poppler / ${hideIcons} / ${phone}`).toContain("+966 50 123 4567");
				} finally {
					await task.destroy();
				}
				expect(data).toEqual(snapshot);
			}
		}
	},
);
