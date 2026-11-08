import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vite-plus/test";
import { act } from "react";
import { configureFontReader } from "@reactive-resume/pdf/native";
import { createResumePdfFile, readServerFont } from "@reactive-resume/pdf/server";
import { getPresentLabel } from "@reactive-resume/schema/resume/dates";
import { extractQualificationPdf } from "./extract";
import { qualificationFixtures } from "./fixtures";
import { regressionIt } from "./regression-status";

for (const language of ["ar", "en", "mixed"] as const)
	for (const format of ["numeric", "iso", "short"] as const)
		regressionIt(`keeps ${language} ${format} month ranges and a separate ongoing label in both readers`)(
			`keeps ${language} ${format} month ranges and a separate ongoing label in both readers`,
			{ timeout: 60000 },
			async () => {
				configureFontReader(readServerFont);
				const input = qualificationFixtures().find((x) => x.language === language);
				assert(input);
				const data = structuredClone(input.data);
				data.metadata.page.dateFormat = format;
				data.sections.projects.items = [];
				const job = data.sections.experience.items[0];
				assert(job);
				job.dates = { start: "2010", end: null, present: true };
				job.position = "";
				job.roles = [
					{
						id: "ongoing",
						position: language === "en" ? "Current Lead" : "قائد حالي",
						period: "",
						dates: { start: format === "short" ? "2023" : "2023-03", end: null, present: true },
						description: "",
					},
					{
						id: "past",
						position: language === "en" ? "Previous Developer" : "مطور سابق",
						period: "",
						dates: {
							start: format === "short" ? "2020" : "2020-03",
							end: format === "short" ? "2021" : "2021-05",
							present: false,
						},
						description: "",
					},
				];
				const current = job.roles[0];
				const past = job.roles[1];
				assert(current && past);
				if (language === "mixed")
					current.dates = {
						start: null,
						end: null,
						present: false,
						raw: `${format === "numeric" ? "03/2023" : format === "iso" ? "2023-03" : "2023"}-حالياً`,
					};
				const snapshot = structuredClone(data);
				const file = await act(() => createResumePdfFile({ data, filename: "ranges.pdf" }));
				const bytes = new Uint8Array(await file.arrayBuffer());
				const readers = await extractQualificationPdf(bytes);
				if (process.env.ROUND8_RANGE_OUTPUT) {
					const directory = process.env.ROUND8_RANGE_OUTPUT;
					await mkdir(directory, { recursive: true });
					await writeFile(join(directory, `${language}-${format}.pdf`), bytes);
					await writeFile(
						join(directory, `${language}-${format}.json`),
						JSON.stringify({ source: data, readers }, null, 2),
					);
				}
				for (const reader of readers.filter((x) => x.reader !== "poppler-layout")) {
					expect(reader.status).toBe("complete");
					const text = reader.text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ");
					// D33(4): English retains upstream formatting; Arabic uses MM/YYYY and natural RTL.
					const range =
						format === "numeric" ? "03/2020 – 05/2021" : format === "iso" ? "2020-03 – 2021-05" : "2020 – 2021";
					const start = format === "short" ? "2023" : language === "en" && format === "iso" ? "2023-03" : "03/2023";
					if (language === "en") expect.soft(text, reader.reader).toContain(range);
					else {
						for (const endpoint of format === "short" ? ["2020", "2021"] : ["03/2020", "05/2021"])
							expect.soft(text, reader.reader).toContain(endpoint);
					}
					// D32 permits endpoint/label reordering, but both remain in the current role's span.
					const role = text.indexOf(current.position);
					const next = text.indexOf(past.position, role + current.position.length);
					expect.soft(role, reader.reader).toBeGreaterThanOrEqual(0);
					expect.soft(next, reader.reader).toBeGreaterThan(role);
					const entry = text.slice(role, next);
					expect.soft(entry, reader.reader).toContain(start);
					expect
						.soft(entry, reader.reader)
						.toContain(language === "mixed" ? "حاليا" : getPresentLabel(data.metadata.page.locale));
				}
				expect(data).toEqual(snapshot);
			},
		);
