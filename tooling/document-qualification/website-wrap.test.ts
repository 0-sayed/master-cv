import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { act } from "react";
import { configureFontReader } from "@reactive-resume/pdf/native";
import { createResumePdfFile, readServerFont } from "@reactive-resume/pdf/server";
import { compareQualification } from "./compare";
import { extractQualificationPdf } from "./extract";
import { validateManifest } from "./manifest";

it("keeps the complete long website label in the opened H3-MIXED-16 Ditgar case", { timeout: 60000 }, async () => {
	configureFontReader(readServerFont);
	const cases = validateManifest(
		JSON.parse(await readFile(new URL("./fixtures/regressions/holdout-3.json", import.meta.url), "utf8")),
	);
	const input = cases.find((item) => item.id === "H3-MIXED-16");
	assert(input);
	const snapshot = structuredClone(input.data);
	const file = await act(() => createResumePdfFile({ data: input.data, filename: "website.pdf" }));
	const bytes = new Uint8Array(await file.arrayBuffer());
	const readers = await extractQualificationPdf(bytes);
	if (process.env.ROUND8_WEBSITE_OUTPUT) {
		const directory = process.env.ROUND8_WEBSITE_OUTPUT;
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "website.pdf"), bytes);
		await writeFile(join(directory, "website.json"), JSON.stringify({ source: input.data, readers }, null, 2));
	}
	for (const reader of readers.filter((item) => item.reader !== "poppler-layout")) {
		expect(reader.status).toBe("complete");
		expect.soft(compareQualification(input.gold, reader.text).missing, reader.reader).not.toContain("website");
	}
	expect(input.data).toEqual(snapshot);
});
