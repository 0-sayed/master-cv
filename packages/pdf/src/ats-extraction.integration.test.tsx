import type { SectionTitleResolver } from "./section-title";
import type { PdfDocumentLike } from "@reactive-resume/resume/ats-pdf";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createElement } from "react";
import { lintResumeForAts } from "@reactive-resume/resume/ats";
import { analyzePdfResume, harvestPdfDocument, PDF_OPS } from "@reactive-resume/resume/ats-pdf";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { createSampleResumeData } from "@reactive-resume/schema/resume/sample";
import { ResumeDocument } from "./document";
import { renderToBuffer } from "./forme/testing";

// English extraction/geometry fixtures must not inherit the product sample's Arabic default.
const sampleResumeData = createSampleResumeData(undefined, "en-US");

function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Missing fixture value");
	return value;
}

const NOW = new Date("2024-06-15T00:00:00Z");

const fixture = (name: string) =>
	new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/ats/${name}`, import.meta.url))));

/**
 * Section headings come from a resolver, not from the resume data — `title` is empty for every
 * stock section. Rendering without one produces a heading-less PDF that no real export looks
 * like, so the app's own behaviour is mirrored here.
 */
const resolveSectionTitle: SectionTitleResolver = (input) => input.defaultEnglishTitle ?? input.sectionId;

async function renderResume(data: ResumeData, template: Template = "onyx"): Promise<Uint8Array> {
	const element = createElement(ResumeDocument, { data, template, resolveSectionTitle }) as unknown as Parameters<
		typeof renderToBuffer
	>[0];
	return new Uint8Array(await renderToBuffer(element));
}

/** Runs the real browser pipeline in Node: pdf.js -> harvest -> analyze. */
async function analyze(bytes: Uint8Array, options: { name?: string } = {}) {
	// PDF.js transfers the buffer it is handed, detaching it — so each run gets its own copy and a
	// caller can analyse the same file twice.
	const loadingTask = getDocument({ data: new Uint8Array(bytes), fontExtraProperties: true });

	try {
		const document = (await loadingTask.promise) as unknown as PdfDocumentLike;
		const raw = await harvestPdfDocument(document, {
			file: { name: options.name ?? "resume.pdf", sizeBytes: bytes.byteLength, magicBytesOk: true },
		});

		return {
			raw,
			report: analyzePdfResume(raw, { now: NOW }),
		};
	} finally {
		await loadingTask.destroy();
	}
}

const failedCodes = (report: Awaited<ReturnType<typeof analyze>>["report"]) =>
	report.checks.filter((check) => check.status === "fail").map((check) => check.code);

describe("PDF operator numbers", () => {
	/**
	 * The engine hardcodes these so the universal package needs no pdf.js dependency. If a release
	 * ever renumbers an operator, this fails here rather than silently mis-reading every file.
	 */
	it("match the installed PDF.js build", () => {
		const actual = OPS as unknown as Record<string, number>;

		for (const [name, value] of Object.entries(PDF_OPS)) {
			expect(actual[name], name).toBe(value);
		}
	});
});

describe("a resume rendered by this app", () => {
	it.each([
		["en-US", "candidate@example.test"],
		["ar-SA", "candidate@example.test"],
		["en-US", ""],
		["ar-SA", ""],
	] as const)("agrees on email in a rendered %s CV", async (locale, email) => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = locale;
		data.metadata.layout.pages = [{ fullWidth: true, main: [], sidebar: [] }];
		data.basics.name = locale === "ar-SA" ? "محمد علي" : "Jane Doe";
		data.basics.email = email;
		const { report } = await analyze(await renderResume(data));
		const pdfMissing = report.checks.find((check) => check.code === "NO_EMAIL")?.status === "fail";
		const dataMissing = lintResumeForAts(data).findings.some((finding) => finding.code === "MISSING_EMAIL");
		expect(pdfMissing).toBe(dataMissing);
		expect(pdfMissing).toBe(!email);
	});
	it.each([
		[
			"NO_EMAIL",
			(data: ResumeData) => {
				data.basics.email = "";
			},
		],
		[
			"NO_PHONE",
			(data: ResumeData) => {
				data.basics.phone = "";
			},
		],
		[
			"NO_EDUCATION_SECTION",
			(data: ResumeData) => {
				required(data.metadata.layout.pages[0]).main = required(data.metadata.layout.pages[0]).main.filter(
					(section) => section !== "education",
				);
			},
		],
		[
			"NO_SKILLS_SECTION",
			(data: ResumeData) => {
				required(data.metadata.layout.pages[0]).main = required(data.metadata.layout.pages[0]).main.filter(
					(section) => section !== "skills",
				);
			},
		],
		[
			"NO_SUMMARY_SECTION",
			(data: ResumeData) => {
				required(data.metadata.layout.pages[0]).main = required(data.metadata.layout.pages[0]).main.filter(
					(section) => section !== "summary",
				);
			},
		],
		[
			"SMALL_BODY_TEXT",
			(data: ResumeData) => {
				data.metadata.typography.body.fontSize = 7;
			},
		],
	] as const)("checks %s in rendered PDFs", { timeout: 60_000 }, async (code, mutate) => {
		const data = structuredClone(sampleResumeData);
		data.metadata.layout.pages = [
			{
				fullWidth: true,
				main: data.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar]),
				sidebar: [],
			},
		];
		const original = structuredClone(data);
		mutate(data);
		const status = (report: ReturnType<typeof analyzePdfResume>) =>
			report.checks.find((entry) => entry.code === code)?.status;
		expect(status((await analyze(await renderResume(original))).report)).toBe("pass");
		expect(status((await analyze(await renderResume(data))).report)).toBe("fail");
	});
	it.each([
		["NO_EDUCATION_SECTION", "education"],
		["NO_SKILLS_SECTION", "skills"],
		["NO_SUMMARY_SECTION", "summary"],
	] as const)("checks %s in rendered Arabic PDFs", { timeout: 60_000 }, async (code, section) => {
		const data = createSampleResumeData(undefined, "ar-SA");
		data.metadata.layout.pages = [
			{
				fullWidth: true,
				main: data.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar]),
				sidebar: [],
			},
		];
		const original = structuredClone(data);
		required(data.metadata.layout.pages[0]).main = required(data.metadata.layout.pages[0]).main.filter(
			(entry) => entry !== section,
		);
		const status = (report: ReturnType<typeof analyzePdfResume>) =>
			report.checks.find((entry) => entry.code === code)?.status;
		expect(status((await analyze(await renderResume(original))).report)).toBe("pass");
		expect(status((await analyze(await renderResume(data))).report)).toBe("fail");
	});
	it.each([
		["en-US", "+44 20 7946 0100"],
		["ar-SA", "+٩٦٦ ٥٥ ١٢٣ ٤٥٦٧"],
		["ar-SA", ""],
		["en-US", ""],
	] as const)("agrees on the phone in a rendered %s CV", async (locale, phone) => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = locale;
		data.metadata.layout.pages = [{ fullWidth: true, main: [], sidebar: [] }];
		data.basics.name = locale === "ar-SA" ? "محمد علي" : "Jane Doe";
		data.basics.phone = phone;
		const { report } = await analyze(await renderResume(data));
		const pdfMissing = report.checks.find((check) => check.code === "NO_PHONE")?.status === "fail";
		const dataMissing = lintResumeForAts(data).findings.some((finding) => finding.code === "MISSING_PHONE");
		expect(pdfMissing).toBe(dataMissing);
		expect(pdfMissing).toBe(!phone);
	});
	it.each([
		["en-US", "Jane Doe"],
		["ar-SA", "محمد علي"],
	] as const)("checks short selectable text rendered in %s", async (locale, name) => {
		const data = structuredClone(defaultResumeData);
		data.metadata.page.locale = locale;
		data.metadata.layout.pages = [{ fullWidth: true, main: [], sidebar: [] }];
		data.basics.name = name;
		const { report } = await analyze(await renderResume(data));
		const status = (code: string) => report.checks.find((check) => check.code === code)?.status;
		expect(status("NO_TEXT_LAYER")).toBe("pass");
		expect(status("VERY_SHORT_DOCUMENT")).toBe("fail");
		expect(status("NO_EMAIL")).toBe("fail");
		expect(report.cappedBy).not.toContain("NO_TEXT_LAYER");
	});
	/**
	 * The sample mixes year-only education/projects with month-year employment. Recognizing the
	 * numeric ranges after entry names exposes that real inconsistency; export defects must not
	 * add any other findings.
	 */
	it("reports only the sample's mixed date granularity in a single-column export", { timeout: 60_000 }, async () => {
		const data = structuredClone(sampleResumeData);
		// One continuous column, retaining every section without the preview sample's explicit page breaks.
		data.metadata.layout.pages = [
			{
				fullWidth: true,
				main: data.metadata.layout.pages.flatMap((page) => [...page.main, ...page.sidebar]),
				sidebar: [],
			},
		];
		const { raw, report } = await analyze(await renderResume(data, "onyx"));

		expect(raw.pages.length).toBeGreaterThan(0);
		expect(raw.operatorsAvailable).toBe(true);
		expect(report.findings.map((finding) => finding.code)).toEqual(["MIXED_DATE_FORMATS"]);
		expect(report.score).toBe(100);
	});
});

describe("adversarial files", () => {
	it("calls a scan what it is", { timeout: 30_000 }, async () => {
		const { report } = await analyze(fixture("image-only-scan.pdf"), { name: "scan.pdf" });
		const codes = failedCodes(report);

		expect(codes).toContain("NO_TEXT_LAYER");
		expect(codes).toContain("IMAGE_ONLY_DOCUMENT");
		expect(report.score).toBeLessThanOrEqual(10);
	});

	it("reads a Type 3 font off the font object", { timeout: 30_000 }, async () => {
		const { raw, report } = await analyze(fixture("type3-font.pdf"), { name: "type3.pdf" });

		expect(raw.fonts.some((font) => font.isType3)).toBe(true);
		expect(failedCodes(report)).toContain("TYPE3_FONT");
		expect(report.score).toBeLessThanOrEqual(25);
	});

	it("sees nothing in text that was converted to outlines", { timeout: 30_000 }, async () => {
		const { raw, report } = await analyze(fixture("outlined-text.pdf"), { name: "outlined.pdf" });

		expect(raw.pages[0]?.items).toHaveLength(0);
		// The page is dense with drawing operations and empty of words — exactly the trap.
		expect(raw.pages[0]?.operators?.pathOpCount ?? 0).toBeGreaterThan(0);
		expect(failedCodes(report)).toContain("NO_TEXT_LAYER");
	});
});
