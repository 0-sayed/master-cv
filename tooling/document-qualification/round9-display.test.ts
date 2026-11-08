import type { QualificationCase } from "./types";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { act } from "react";
import { configureFontReader } from "@reactive-resume/pdf/native";
import { createResumePdfFile, readServerFont } from "@reactive-resume/pdf/server";
import { compareQualification } from "./compare";
import { extractQualificationPdf } from "./extract";
import { qualificationFixtures } from "./fixtures";
import { validateManifest } from "./manifest";
import { regressionIt } from "./regression-status";

const clean = (text: string) => text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ");
async function render(input: QualificationCase, id: string) {
	configureFontReader(readServerFont);
	const snapshot = structuredClone(input.data);
	const file = await act(() => createResumePdfFile({ data: input.data, filename: "display.pdf" }));
	const bytes = new Uint8Array(await file.arrayBuffer());
	const readers = await extractQualificationPdf(bytes);
	if (process.env.ROUND9_DISPLAY_OUTPUT) {
		const dir = process.env.ROUND9_DISPLAY_OUTPUT;
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, id + ".pdf"), bytes);
		await writeFile(join(dir, id + ".json"), JSON.stringify({ source: snapshot, readers }, null, 2));
	}
	expect(input.data).toEqual(snapshot);
	return readers.filter((x) => x.reader !== "poppler-layout");
}
for (const language of ["ar", "en", "mixed"] as const) {
	it(`isolates free-text numeric dates in ${language} without changing saved source`, { timeout: 60000 }, async () => {
		const input = qualificationFixtures().find((x) => x.language === language);
		assert(input);
		const c = structuredClone(input);
		c.data.metadata.template = "onyx";
		c.data.sections.projects.items = [];
		c.data.summary.content =
			"<p>١٤٤٠ هـ - ١٤٤١ هـ</p><p>1442 هـ – 1443 هـ</p><p>من 2010 إلى 2012</p><p>2014 - 2016</p>";
		for (const r of await render(c, `dates-${language}`)) {
			expect(r.status).toBe("complete");
			// D32: reader order is unconstrained; D33 preserves labelled wording and spaced ranges.
			for (const token of ["1440", "1441", "1442", "1443", "2010", "2012", "2014", "2016"])
				expect.soft(clean(r.text), r.reader).toContain(token);
			for (const word of ["هـ", "من", "إلى"]) expect.soft(r.text, r.reader).toContain(word);
		}
	});
	for (const template of ["ditgar", "onyx", "bronzor", "azurill"] as const)
		regressionIt(`preserves long ${language} website on ${template}`)(
			`preserves long ${language} website on ${template}`,
			{ timeout: 60000 },
			async () => {
				const cases = validateManifest(
					JSON.parse(await readFile(new URL("./fixtures/regressions/holdout-3.json", import.meta.url), "utf8")),
				);
				const original = cases.find((x) => x.id === "H3-MIXED-16");
				assert(original);
				const c = structuredClone(original);
				c.data.metadata.template = template;
				c.data.metadata.page.locale = language === "en" ? "en-US" : "ar-SA";
				for (const r of await render(c, `website-${language}-${template}`)) {
					expect(r.status).toBe("complete");
					expect.soft(clean(r.text), r.reader).toContain(c.data.basics.website.label);
				}
			},
		);
}
for (const id of ["H4-MIXED-15", "H4-MIXED-17", "H4-MIXED-19"])
	it(`keeps skill word boundaries in opened ${id}`, { timeout: 60000 }, async () => {
		const cases = validateManifest(
			JSON.parse(await readFile(new URL("./fixtures/regressions/holdout-4.json", import.meta.url), "utf8")),
		);
		const input = cases.find((x) => x.id === id);
		assert(input);
		for (const r of await render(input, id)) {
			expect(r.status).toBe("complete");
			expect.soft(compareQualification(input.gold, r.text, "fact-level v2").missing, r.reader).not.toContain("skill");
		}
	});

for (const id of ["H2-MIXED-17", "H2-MIXED-20"])
	it(`preserves the existing two-column skill boundary in ${id}`, { timeout: 60000 }, async () => {
		const cases = validateManifest(
			JSON.parse(await readFile(new URL("./fixtures/regressions/dev-holdout-2.json", import.meta.url), "utf8")),
		);
		const input = cases.find((x) => x.id === id);
		assert(input);
		const baseline = JSON.parse(await readFile(new URL(`./fixtures/regressions/${id}.json`, import.meta.url), "utf8"));
		for (const r of await render(input, id)) {
			const previous = baseline.readers.find((reader: { reader: string }) => reader.reader === r.reader);
			// Preserve both readers' prior outcomes: Poppler's existing joined-word limitation stays unqualified.
			expect
				.soft(compareQualification(input.gold, r.text, "fact-level v2").missing.includes("skill"), r.reader)
				.toBe(previous.comparisons["fact-level v2"].missing.includes("skill"));
		}
	});

it("does not canonicalize a phone split by rich-text formatting", { timeout: 60000 }, async () => {
	const seed = qualificationFixtures().find((x) => x.language === "en");
	assert(seed);
	const input = structuredClone(seed);
	input.data.summary.content = "<p><b>+966</b> 2010 - 2012</p>";
	for (const r of await render(input, "formatted-phone")) expect(clean(r.text)).not.toContain("2010-2012");
});
