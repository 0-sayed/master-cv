import { expect, it } from "vite-plus/test";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { compareQualification } from "./compare";
import { extractQualificationPdf } from "./extract";
import { qualificationFixtures } from "./fixtures";

it.each([
	["AR01", "azurill"],
	["AR01", "ditto"],
	["AR01", "kakuna"],
	["AR01", "persian"],
	["MX01", "ditto"],
	["MX01", "meowth"],
] as const)(
	"reads the %s %s header before its body with intact associations",
	{ timeout: 60000 },
	async (id, template) => {
		const input = qualificationFixtures().find((fixture) => fixture.id === id);
		if (!input) throw new Error(`Missing ${id}`);
		input.data.metadata.template = template;
		const snapshot = structuredClone(input.data);
		const company = input.data.sections.experience.items[0]?.company;
		if (!company) throw new Error("Missing company");
		const file = await act(() => createResumePdfFile({ data: input.data, filename: "header.pdf" }));
		const readers = await extractQualificationPdf(new Uint8Array(await file.arrayBuffer()));
		for (const reader of readers.filter((reader) => reader.reader !== "poppler-layout")) {
			expect(reader.status).toBe("complete");
			const comparison = compareQualification(input.gold, reader.text);
			expect.soft(comparison.associationFailures, reader.reader).toEqual([]);
			const nameIndex = reader.text.indexOf(input.data.basics.name);
			const companyIndex = reader.text.indexOf(company);
			expect.soft(nameIndex, reader.reader).toBeGreaterThanOrEqual(0);
			expect.soft(companyIndex, reader.reader).toBeGreaterThanOrEqual(0);
			expect.soft(nameIndex, reader.reader).toBeLessThan(companyIndex);
		}
		expect(input.data).toEqual(snapshot);
	},
);

it.each(["AR01", "MX01", "EN01"])(
	"keeps shared Onyx role/employer/date associations for %s",
	{ timeout: 60000 },
	async (id) => {
		const input = qualificationFixtures().find((fixture) => fixture.id === id);
		if (!input) throw new Error(`Missing ${id}`);
		const snapshot = structuredClone(input.data);
		const file = await act(() => createResumePdfFile({ data: input.data, filename: "header.pdf" }));
		const readers = await extractQualificationPdf(new Uint8Array(await file.arrayBuffer()));
		for (const reader of readers.filter((reader) => reader.reader !== "poppler-layout")) {
			expect(reader.status).toBe("complete");
			expect.soft(compareQualification(input.gold, reader.text).associationFailures, reader.reader).toEqual([]);
		}
		expect(input.data).toEqual(snapshot);
	},
);

it.each(["glalie", "ditgar", "pikachu"] as const)(
	"preserves the stacked RTL sidebar header in %s",
	{ timeout: 60000 },
	async (template) => {
		const input = qualificationFixtures().find((fixture) => fixture.id === "AR01");
		if (!input) throw new Error("Missing AR01");
		const data = structuredClone(input.data);
		data.metadata.template = template;
		data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: ["experience"] }];
		const job = data.sections.experience.items[0];
		if (!job) throw new Error("Missing job");
		job.location = "العلا";
		const file = await act(() => createResumePdfFile({ data, filename: "stacked.pdf" }));
		const [reader] = await extractQualificationPdf(new Uint8Array(await file.arrayBuffer()));
		const items = reader?.rawPages?.flatMap((page) => page.items) ?? [];
		const company = items.find((item) => item.str.includes("شركة الأفق"));
		const location = items.find((item) => item.str.includes("العلا"));
		if (!company || !location) throw new Error("Header text missing");
		const companyY = company.transform[5];
		const locationY = location.transform[5];
		if (companyY === undefined || locationY === undefined) throw new Error("Coordinate missing");
		expect(locationY).toBeLessThan(companyY);
	},
);
