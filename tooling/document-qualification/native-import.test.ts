import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { pdfImportText } from "@reactive-resume/import/pdf-lines";
import { parseResumeText } from "@reactive-resume/import/plain-text";
import { analyzePdfResume, harvestPdfDocument } from "@reactive-resume/resume/ats-pdf";
import { parseResumeData } from "@reactive-resume/schema/resume/data";

// Authored separately from Forme: Chromium print PDFs with checked-in HTML sources.
const cases = [
	{ language: "ar", name: "أحمد العتيبي", company: "شركة الأفق", role: "مهندس برمجيات", school: "جامعة الملك سعود" },
	{
		language: "en",
		name: "Ada Lovelace",
		company: "Horizon Systems",
		role: "Software Engineer",
		school: "Example University",
	},
	{ language: "mixed", name: "ليلى الحربي", company: "شركة النور", role: "Software Engineer", school: "جامعة جدة" },
] as const;
for (const gold of cases)
	it(`imports independent native ${gold.language} PDF facts and associations`, async () => {
		const bytes = await readFile(new URL(`./native/${gold.language}.pdf`, import.meta.url));
		const task = getDocument({ data: Uint8Array.from(bytes), fontExtraProperties: true });
		try {
			const raw = await harvestPdfDocument(await task.promise, {
				file: { name: `${gold.language}.pdf`, sizeBytes: bytes.length, magicBytesOk: true },
			});
			const { lines, locale } = pdfImportText(raw);
			const data = parseResumeText(lines.join("\n"), locale ? { locale } : {});
			const report = analyzePdfResume(raw, {
				locale: data.metadata.page.locale,
				now: new Date("2024-06-15T00:00:00Z"),
			});
			const directory = join(import.meta.dirname, "../../test-results/document-qualification/native");
			await mkdir(directory, { recursive: true });
			await writeFile(
				join(directory, `${gold.language}.json`),
				JSON.stringify(
					{
						source: "Chromium print PDF; synthetic independently authored HTML",
						sha256: createHash("sha256").update(bytes).digest("hex"),
						gold,
						lines,
						data,
						raw,
						report,
						humanReview: "pending",
					},
					null,
					2,
				),
			);
			expect(data.basics).toMatchObject({
				name: gold.name,
				email: "synthetic@example.test",
				phone: "+966 50 123 4567",
			});
			expect(data.sections.experience.items).toHaveLength(1);
			expect(data.sections.experience.items[0]).toMatchObject({
				company: gold.company,
				position: gold.role,
				dates: { start: "2020", end: "2022", present: false },
			});
			expect(data.sections.education.items[0]).toMatchObject({
				school: gold.school,
				dates: { start: "2016", end: "2020", present: false },
			});
			expect(data.sections.skills.items[0]?.name).toBe("TypeScript");
			expect(parseResumeData(parseResumeData(data))).toEqual(data);
			expect(report.analysis?.status).toBe("complete");
			expect(report.findings.filter((finding) => finding.severity === "blocker")).toEqual([]);
			for (const code of ["NO_EXPERIENCE_SECTION", "NO_EDUCATION_SECTION", "NO_SKILLS_SECTION"])
				expect(report.checks.find((check) => check.code === code)?.status).toBe("pass");
		} finally {
			await task.destroy();
		}
	});
