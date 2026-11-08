import { expect, it } from "vite-plus/test";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { expectedExportTextDisplay } from "./expected-display";
import { extractQualificationPdf } from "./extract";
import { qualificationFixtures } from "./fixtures";

it.each(["AR02", "MX02"])(
	"applies D33 display normalization in the %s name in both readers",
	{ timeout: 60000 },
	async (id) => {
		const input = qualificationFixtures().find((fixture) => fixture.id === id);
		if (!input) throw new Error(`Missing ${id}`);
		const snapshot = structuredClone(input.data);
		const file = await act(() => createResumePdfFile({ data: input.data, filename: "marks.pdf" }));
		const readers = await extractQualificationPdf(new Uint8Array(await file.arrayBuffer()));
		for (const reader of readers.filter((reader) => reader.reader !== "poppler-layout")) {
			expect(reader.status).toBe("complete");
			expect.soft(reader.text, reader.reader).toContain(expectedExportTextDisplay(input.data.basics.name));
		}
		expect(input.data).toEqual(snapshot);
	},
);
