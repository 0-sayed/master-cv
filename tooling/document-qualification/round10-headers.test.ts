import type { ResumeData } from "@reactive-resume/schema/resume/data";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { extractQualificationPdf } from "./extract";
import { validateManifest } from "./manifest";
import { regressionIt } from "./regression-status";

const projectDateValues = (items: ResumeData["sections"]["projects"]["items"]): string[] =>
	items
		.filter((item) => !item.hidden && item.name.trim())
		.map((item) => item.dates?.raw ?? item.period)
		.filter(Boolean);
it("inventories dates for every visible, titled project", async () => {
	const { defaultResumeData } = await import("@reactive-resume/schema/resume/default");
	const data = structuredClone(defaultResumeData);
	const item = {
		id: "first",
		hidden: false,
		name: "First",
		period: "1447 هـ",
		description: "",
		website: { url: "", label: "", inlineLink: false },
	};
	data.sections.projects.items = [
		item,
		{ ...item, id: "second", period: "2011 - 2013" },
		{ ...item, id: "hidden", hidden: true, period: "8888" },
		{ ...item, id: "draft", name: " ", period: "9999" },
	];
	expect(projectDateValues(data.sections.projects.items)).toEqual(["1447 هـ", "2011 - 2013"]);
});

for (const id of ["H5-EN-10", "H5-EN-11", "H5-EN-14", "H5-MIXED-15", "H5-MIXED-18", "H5-MIXED-19"])
	regressionIt(`keeps every project date within Projects: ${id}`)(
		`keeps every project date within Projects: ${id}`,
		{ timeout: 60000 },
		async () => {
			const root = new URL("../../", import.meta.url);
			const input = validateManifest(
				JSON.parse(
					await readFile(new URL("tooling/document-qualification/fixtures/regressions/holdout-5.json", root), "utf8"),
				),
			).find((x) => x.id === id);
			assert(input);
			const before = structuredClone(input.data);
			const file = await act(() => createResumePdfFile({ data: input.data, filename: id + ".pdf" }));
			const bytes = new Uint8Array(await file.arrayBuffer());
			const directory = new URL(
				process.env.DOCUMENT_HEADER_OUTPUT ?? "test-results/document-qualification/header-regressions/",
				root,
			);
			await mkdir(directory, { recursive: true });
			await writeFile(new URL(id + ".pdf", directory), bytes);
			const readers = await extractQualificationPdf(bytes);
			await writeFile(new URL(id + ".json", directory), JSON.stringify(readers, null, 2));
			for (const reader of readers.filter((x) => x.reader !== "poppler-layout")) {
				const text = reader.text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ");
				const end = text.indexOf(input.data.sections.skills.title || (input.language === "en" ? "Skills" : "المهارات"));
				expect
					.soft(end, reader.reader)
					.toBeGreaterThan(
						text.indexOf(input.data.sections.projects.title || (input.language === "en" ? "Projects" : "المشاريع")),
					);
				const numbers = projectDateValues(input.data.sections.projects.items).flatMap(
					(value) => value.match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}/gu) ?? [],
				);
				expect(numbers.length).toBeGreaterThan(0);
				for (const number of numbers) {
					expect
						.soft(
							text.indexOf(
								number,
								text.indexOf(input.data.sections.projects.title || (input.language === "en" ? "Projects" : "المشاريع")),
							),
							reader.reader + " " + number,
						)
						.toBeGreaterThan(
							text.indexOf(input.data.sections.projects.title || (input.language === "en" ? "Projects" : "المشاريع")),
						);
					expect
						.soft(
							text.indexOf(
								number,
								text.indexOf(input.data.sections.projects.title || (input.language === "en" ? "Projects" : "المشاريع")),
							),
							reader.reader + " " + number,
						)
						.toBeLessThan(end);
				}
			}
			expect(input.data).toEqual(before);
		},
	);

for (const language of ["en", "ar"] as const)
	regressionIt(`keeps dated certifications, awards, publications and volunteering beside each owner in ${language}`)(
		`keeps dated certifications, awards, publications and volunteering beside each owner in ${language}`,
		{ timeout: 60000 },
		async () => {
			const { qualificationFixtures } = await import("./fixtures");
			const input = qualificationFixtures().find((x) => x.language === language);
			assert(input);
			const data = input.data;
			data.metadata.template = "lapras";
			data.metadata.layout.pages = [
				{ fullWidth: true, main: ["certifications", "awards", "publications", "volunteer", "skills"], sidebar: [] },
			];
			const base = {
				id: "cert",
				hidden: false,
				title: "Archive Credential",
				date: "12/09/2032",
				website: { url: "", label: "", inlineLink: false },
				description: "<p>Verified source records.</p>",
			};
			data.sections.certifications.items = [{ ...base, issuer: "Source Institute" }];
			data.sections.awards.items = [
				{ ...base, id: "award", title: "Archive Award", date: "2033", awarder: "Source Council" },
			];
			data.sections.publications.items = [
				{ ...base, id: "publication", title: "Archive Paper", date: "2034", publisher: "Source Press" },
			];
			data.sections.volunteer.items = [
				{
					id: "volunteer",
					hidden: false,
					organization: "Archive Volunteers",
					period: "2035",
					location: "",
					website: base.website,
					description: base.description,
				},
			];
			const before = structuredClone(data);
			const file = await act(() => createResumePdfFile({ data, filename: "owners.pdf" }));
			if (process.env.DOCUMENT_OWNER_OUTPUT) {
				await mkdir(process.env.DOCUMENT_OWNER_OUTPUT, { recursive: true });
				await writeFile(
					`${process.env.DOCUMENT_OWNER_OUTPUT}/owners-${language}.pdf`,
					new Uint8Array(await file.arrayBuffer()),
				);
			}
			for (const reader of (await extractQualificationPdf(new Uint8Array(await file.arrayBuffer()))).filter(
				(x) => x.reader !== "poppler-layout",
			)) {
				const text = reader.text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ");
				for (const [anchor, date, next] of [
					["Archive Credential", "12/09/2032", "Archive Award"],
					["Archive Award", "2033", "Archive Paper"],
					["Archive Paper", "2034", "Archive Volunteers"],
					["Archive Volunteers", "2035", language === "en" ? "Skills" : "المهارات"],
				]) {
					assert(anchor && date && next);
					expect
						.soft(text.indexOf(date), reader.reader + date)
						.toBeGreaterThanOrEqual(text.indexOf(anchor) - date.length - 1);
					expect.soft(text.indexOf(date), reader.reader + date).toBeLessThan(text.indexOf(next));
				}
			}
			expect(data).toEqual(before);
		},
	);

it("keeps H5-MIXED-19 education date before the Projects heading", { timeout: 60000 }, async () => {
	const root = new URL("../../", import.meta.url);
	const input = validateManifest(
		JSON.parse(
			await readFile(new URL("tooling/document-qualification/fixtures/regressions/holdout-5.json", root), "utf8"),
		),
	).find((x) => x.id === "H5-MIXED-19");
	assert(input);
	const file = await act(() => createResumePdfFile({ data: input.data, filename: "education.pdf" }));
	for (const reader of (await extractQualificationPdf(new Uint8Array(await file.arrayBuffer()))).filter(
		(x) => x.reader !== "poppler-layout",
	)) {
		const text = reader.text.replace(/[\u202a-\u202e\u2066-\u2069]/gu, "").replace(/\s+/gu, " ");
		for (const endpoint of ["2002", "2006"]) {
			expect(text.indexOf(endpoint), reader.reader).toBeGreaterThan(text.indexOf("التعليم"));
			expect(text.indexOf(endpoint), reader.reader).toBeLessThan(text.indexOf("المشاريع"));
		}
	}
});
