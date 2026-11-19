import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { act } from "react";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { lintResumeForAts } from "@reactive-resume/resume/ats";
import {
	analyzePdfResume,
	buildExtractedDocument,
	buildResumeSemantics,
	harvestPdfDocument,
	PDF_ATS_RULE_CODES,
} from "@reactive-resume/resume/ats-pdf";
import { templateLayouts, templateSchema } from "@reactive-resume/schema/templates";
import { verifiedPoppler } from "../document-qualification/toolchain";
import { realPdfFixture } from "./real-pdf-fixture";

const now = new Date("2026-11-19T09:00:00Z");
const rows: unknown[] = [];
let poppler: Awaited<ReturnType<typeof verifiedPoppler>>;
beforeAll(async () => {
	poppler = await verifiedPoppler();
});
const cases = templateSchema.options.flatMap((template) =>
	(["ar-SA", "en-US"] as const).flatMap((locale) => [false, true].map((weak) => ({ template, locale, weak }))),
);

afterAll(() => {
	if (process.env.REAL_PDF_AUDIT_OUTPUT)
		writeFileSync(process.env.REAL_PDF_AUDIT_OUTPUT, JSON.stringify(rows, null, 2));
});

it.each(cases)(
	"reads $template $locale weak=$weak from a real export",
	async ({ template, locale, weak }) => {
		const data = realPdfFixture(template, locale, weak);
		const source = lintResumeForAts(data, { now });
		const file = await act(() => createResumePdfFile({ data, filename: `${template}-${locale}.pdf` }));
		const bytes = new Uint8Array(await file.arrayBuffer());
		const popplerText = execFileSync(poppler.binaryPath, ["-enc", "UTF-8", "-", "-"], {
			input: bytes,
			env: poppler.env,
			encoding: "utf8",
			maxBuffer: 2 * 1024 * 1024,
			timeout: 10_000,
		});
		const hash = createHash("sha256").update(bytes).digest("hex");
		const task = getDocument({ data: bytes, fontExtraProperties: true });
		try {
			const raw = await harvestPdfDocument(await task.promise, {
				file: { name: file.name, sizeBytes: file.size, magicBytesOk: true },
			});
			const doc = buildExtractedDocument(raw);
			const semantics = buildResumeSemantics(raw, doc, { now, locale });
			expect.soft(semantics.bulletLineCount).toBe(weak ? 7 : 16);
			expect.soft(semantics.longBulletCount).toBe(weak ? 7 : 0);
			expect.soft(semantics.employmentGapYears.map(({ from, to }) => [from, to])).toEqual(weak ? [[2017, 2020]] : []);
			if (weak)
				expect
					.soft([...new Set(semantics.dates.filter((date) => date.kind === "range").map((date) => date.shape))].sort())
					.toEqual(["mon-year", "numeric", "year"]);
			const pdf = analyzePdfResume(raw, { now, locale });
			const codes = [...pdf.findings, ...pdf.tips].map((finding) => finding.code).sort();
			expect(pdf.checks).toHaveLength(PDF_ATS_RULE_CODES.length);
			expect.soft(codes).not.toContain("NO_PROFESSIONAL_LINK");
			expect.soft(codes).not.toContain("NO_SUMMARY_SECTION");
			if (template === "glalie" && locale === "ar-SA" && !weak)
				expect.soft(codes).toContain("EMAIL_SPLIT_ACROSS_ITEMS");
			expect.soft(codes).not.toContain("REPEATED_HEADER_FOOTER");
			expect.soft(codes).not.toContain("UNPARSEABLE_DATE_RANGE");
			expect.soft(codes).not.toContain("NO_CURRENT_ROLE_MARKER");
			expect.soft(codes).not.toContain("NO_EDUCATION_SECTION");
			const layoutCodes = ["MULTI_COLUMN_LAYOUT", "READING_ORDER_INVERSION", "COLUMN_GUTTER", "READING_ORDER_RISK"];
			if (codes.includes("MULTI_COLUMN_LAYOUT")) expect.soft(codes).not.toContain("COLUMN_GUTTER");
			expect
				.soft(codes.some((code) => layoutCodes.includes(code)))
				.toBe(weak || templateLayouts[template].columns === 2);
			const seededCodes = [
				"NO_PHONE",
				"LONG_BULLETS",
				"WEAK_ACTION_VERBS",
				"MIXED_DATE_FORMATS",
				"SMALL_BODY_TEXT",
				"FIRST_PERSON_PRONOUNS",
				"NO_SKILLS_SECTION",
				"EMPLOYMENT_GAP",
			];
			const expectedPdf = [
				"UNTAGGED_PDF",
				...(weak ? [...seededCodes, "NO_QUANTIFIED_IMPACT", ...(locale === "en-US" ? ["REPEATED_PHRASES"] : [])] : []),
				...(template === "gengar" ? ["NARROW_PAGE_MARGINS"] : []),
				...(template === "glalie" && locale === "ar-SA" && !weak ? ["EMAIL_SPLIT_ACROSS_ITEMS"] : []),
			].sort();
			expect.soft(codes.filter((code) => !layoutCodes.includes(code))).toEqual(expectedPdf);
			const facts = [
				data.basics.name,
				data.basics.email,
				data.basics.phone,
				data.basics.location,
				...data.sections.experience.items.flatMap((item) => [item.company, item.position]),
				...data.sections.education.items.map((item) => item.school),
			].filter(Boolean);
			const compact = (text: string) =>
				text
					.normalize("NFKC")
					.replace(/[\u064B-\u0652\u0670]/gu, "")
					.replace(/[^\p{L}\p{N}]/gu, "")
					.toLowerCase();
			const rawText = raw.pages.map((page) => page.items.map((item) => item.str).join(" ")).join("\n");
			const diagnostics = (
				[
					["PDF.js", doc.fullText],
					["Poppler", popplerText],
				] as const
			).map(([reader, text]) => ({
				reader,
				fragmentedFacts: facts.filter((fact) => !compact(text).includes(compact(fact))),
				missingWords: facts
					.flatMap((fact) => fact.match(/\p{L}+/gu) ?? [])
					.filter((word) => !compact(text).includes(compact(word))),
				damagedCharacters: /[\uFFFD\uE000-\uF8FF]/u.test(text),
				splitArabicWords: ["التقار ير", "الإنجليز ية"].filter((word) => text.includes(word)),
			}));
			for (const diagnostic of diagnostics) {
				// This wrapped email retains every character in the stream, but interleaves in geometric text.
				const fragmentedEmail = diagnostic.reader === "PDF.js" && template === "glalie" && locale === "ar-SA" && !weak;
				expect.soft(diagnostic.missingWords, diagnostic.reader).toEqual(fragmentedEmail ? ["test"] : []);
				expect.soft(diagnostic.damagedCharacters, diagnostic.reader).toBe(false);
			}
			for (const fact of facts) expect.soft(compact(rawText)).toContain(compact(fact));
			const expectedRanges = [...data.sections.experience.items, ...data.sections.education.items].map((item) => {
				const years = item.period.match(/(?:19|20)\d{2}/gu);
				if (!years?.length) throw new Error("The demo needs a dated period.");
				return [Number(years[0]), item.dates?.present ? null : Number(years.at(-1))];
			});
			for (const [startYear, endYear] of expectedRanges)
				expect
					.soft(semantics.dates.some((date) => date.parsed && date.startYear === startYear && date.endYear === endYear))
					.toBe(true);
			rows.push({
				template,
				locale,
				weak,
				hash,
				size: file.size,
				facts,
				diagnostics,
				source: source.findings,
				pdf: [...pdf.findings, ...pdf.tips],
				checks: pdf.checks,
				text: doc.fullText,
				popplerText,
				rawText,
				geometry: doc.pages,
				links: raw.links,
				semantics,
			});
			const dataCodes = [...new Set(source.findings.map((finding) => finding.code))].sort();
			const expectedData = weak
				? [
						"MISSING_PHONE",
						"SMALL_BODY_FONT",
						"NON_STANDARD_SECTION_TITLE",
						templateLayouts[template].columns === 2 ? "TWO_COLUMN_LAYOUT" : "MULTI_COLUMN_PROSE_SECTION",
					].sort()
				: templateLayouts[template].columns === 2
					? ["TWO_COLUMN_LAYOUT"]
					: [];
			expect.soft(dataCodes).toEqual(expectedData);
			expect(pdf.checks.filter((check) => check.skipReason === "execution-failed")).toEqual([]);
			if (weak) {
				for (const code of [
					"NO_PHONE",
					"LONG_BULLETS",
					"WEAK_ACTION_VERBS",
					"MIXED_DATE_FORMATS",
					"SMALL_BODY_TEXT",
					"FIRST_PERSON_PRONOUNS",
					"NO_SKILLS_SECTION",
					"EMPLOYMENT_GAP",
				])
					expect(codes, code).toContain(code);
			} else {
				for (const code of [
					"NO_PHONE",
					"LONG_BULLETS",
					"WEAK_ACTION_VERBS",
					"MIXED_DATE_FORMATS",
					"SMALL_BODY_TEXT",
					"FIRST_PERSON_PRONOUNS",
					"NO_SKILLS_SECTION",
					"EMPLOYMENT_GAP",
				])
					expect(codes, code).not.toContain(code);
			}
		} finally {
			await task.destroy();
		}
	},
	30_000,
);
