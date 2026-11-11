import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { detectImportKind, detectJsonImportKind, parseResumeJson, readResumeFile } from "./read-file";

const pdf = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock("@/features/ats-checker/extract-client", () => ({ extractPdf: pdf.extract }));

const lines = [
	"أحمد العتيبي",
	"synthetic@example.test",
	"الخبرة العملية",
	"شركة الأفق | مهندس برمجيات",
	"يناير ٢٠٢٠ - مارس ٢٠٢٢",
	"التعليم",
	"جامعة الملك سعود | علوم الحاسب",
	"٢٠١٦ - ٢٠٢٠",
];

const nativeFixture = {
	version: 1,
	file: { name: "ar.pdf", sizeBytes: 1, magicBytesOk: true },
	pageCount: 1,
	truncated: false,
	fonts: [],
	links: [],
	operatorsAvailable: false,
	metadata: { language: "ar-SA" },
	pages: [
		{
			pageNumber: 1,
			width: 595,
			height: 842,
			rotation: 0,
			operators: null,
			items: lines.map((str, index) => ({
				str,
				width: 400,
				height: 10,
				dir: /[\u0600-\u06ff]/u.test(str) ? "rtl" : "ltr",
				transform: [10, 0, 0, 10, 60, 780 - index * 20],
				fontRef: "font",
				hasEOL: true,
			})),
		},
	],
};

it("imports Arabic month dates using the source PDF language while the interface is English", async () => {
	pdf.extract.mockResolvedValue(nativeFixture);
	const data = await readResumeFile(new File(["%PDF-"], "ar.pdf"), "pdf", { aiAvailable: false });
	expect(data.metadata.page.locale).toBe("ar-SA");
	expect(data.sections.experience.items[0]?.dates).toMatchObject({ start: "2020-01", end: "2022-03" });
});

beforeAll(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));

it("sends uncertain native fields to review without populating a guessed position", async () => {
	const onUncertain = vi.fn();
	const page = nativeFixture.pages[0];
	const item = page?.items[0];
	if (!page || !item) throw new Error("Missing synthetic PDF fixture");
	pdf.extract.mockResolvedValue({
		...nativeFixture,
		pages: [
			{
				...page,
				items: [
					"Taylor Example",
					"taylor@example.test",
					"EXPERIENCE",
					"Example Labs | Remote | 2024 – Present",
					"• Built a service.",
				].map((str, index) => ({ ...item, str, dir: "ltr", transform: [10, 0, 0, 10, 60, 780 - index * 20] })),
			},
		],
	});
	const data = await readResumeFile(new File(["%PDF-"], "synthetic.pdf"), "pdf", { aiAvailable: false, onUncertain });
	expect(data.sections.experience.items[0]?.position).toBe("");
	expect(onUncertain).toHaveBeenCalledWith(expect.objectContaining({ field: "position" }));
});

describe("detectJsonImportKind", () => {
	it("detects JSON Resume by a top-level basics without Reactive Resume sections/metadata", () => {
		expect(detectJsonImportKind({ basics: { name: "A" }, work: [] })).toBe("json-resume-json");
	});

	it("detects the current Reactive Resume schema by metadata.page", () => {
		expect(detectJsonImportKind({ basics: {}, sections: {}, metadata: { page: { locale: "en-US" } } })).toBe(
			"reactive-resume-json",
		);
	});

	it("detects the legacy v4 schema by metadata without a page key, or by a v4 layout", () => {
		expect(detectJsonImportKind({ basics: {}, sections: {}, metadata: { template: "azurill" } })).toBe(
			"reactive-resume-v4-json",
		);
		expect(
			detectJsonImportKind({
				basics: {},
				sections: {},
				metadata: { layout: [[["experience"], ["skills"]]], page: { margin: 14, format: "a4" } },
			}),
		).toBe("reactive-resume-v4-json");
	});
});

describe("detectImportKind", () => {
	const file = (bytes: BlobPart, name: string, type = "") => new File([bytes], name, { type });

	it("prefers LinkedIn for .zip and Word for other ZIP containers", async () => {
		const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
		expect(await detectImportKind(file(zip, "Basic_LinkedInDataExport.zip"))).toBe("linkedin");
		expect(await detectImportKind(file(zip, "resume.docx"))).toBe("docx");
	});
});

describe("parseResumeJson (legacy styles)", () => {
	it("imports a resume extracted from the account archive", () => {
		const exported = { id: "r1", name: "My resume", data: sampleResumeData };
		expect(detectJsonImportKind(exported)).toBe("reactive-resume-json");
		const imported = parseResumeJson(JSON.stringify(exported), "reactive-resume-json");
		expect(imported.basics).toEqual(sampleResumeData.basics);
		expect(imported.sections.experience.items).toEqual(sampleResumeData.sections.experience.items);
	});
	it("converts an old export's legacy style rules into its stylesheet", () => {
		const data = structuredClone(sampleResumeData);
		data.metadata.stylesheet = undefined;
		data.metadata.styleRules = [
			{
				id: "r",
				label: "Teal headings",
				enabled: true,
				target: { scope: "global" },
				slots: { heading: { color: "#0f766e" } },
			},
		];

		const imported = parseResumeJson(JSON.stringify(data), "reactive-resume-json");

		expect(imported.metadata.stylesheet?.mode).toBe("semantic");
		expect(imported.metadata.stylesheet?.source.text).toContain("color: #0f766e;");
	});
});

it("rejects legacy Word before it reaches the OOXML parser", async () => {
	const file = new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "resume.doc", {
		type: "application/msword",
	});
	await expect(detectImportKind(file)).rejects.toThrow("save it as .docx");
});

it("keeps PDF native even with a provider, and refuses Word without selecting a model", async () => {
	pdf.extract.mockResolvedValue(nativeFixture);
	await expect(readResumeFile(new File(["%PDF-"], "cv.pdf"), "pdf", { aiAvailable: true })).resolves.toBeDefined();
	await expect(readResumeFile(new File(["PK"], "cv.docx"), "docx", { aiAvailable: true })).rejects.toThrow(
		"not available",
	);
});
