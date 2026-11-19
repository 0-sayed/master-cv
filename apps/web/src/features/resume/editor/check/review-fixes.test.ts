import { beforeAll, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createResumePdfFile } from "@reactive-resume/pdf/server";
import { lintResumeForAts, suggestSectionHeading, standardSectionHeadings } from "@reactive-resume/resume/ats";
import { analyzePdfResume, harvestPdfDocument, type PdfDocumentLike } from "@reactive-resume/resume/ats-pdf";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { acceptFix, chooseFix, fixIsValid, prepareFix } from "./fix-preview";
import { buildIssues } from "./issues";
import { groupFindings, prepareIssueFixes, primaryEmailChoice } from "./review-fixes";

const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "revision", editGeneration: 0 };
beforeAll(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));

it("groups by rule in stable order without changing item counts", () => {
	const findings = [
		{ code: "heading", id: 1 },
		{ code: "contact", id: 2 },
		{ code: "heading", id: 3 },
	];
	const groups = groupFindings(findings, (finding) => finding.code);
	expect(groups).toEqual([[findings[0], findings[2]], [findings[1]]]);
	expect(groups.flat()).toHaveLength(3);
});

it.each(["ar-SA", "en-US"])("suggests conventional development headings from the %s document list", (locale) => {
	const heading = suggestSectionHeading(locale, "summary", "خطة التطوير المهني professional development plan");
	expect(standardSectionHeadings(locale)).toContain(heading);
	expect(standardSectionHeadings(locale, "certifications")).toContain(heading);
	expect(/\p{Script=Arabic}/u.test(heading)).toBe(locale.startsWith("ar"));
});

it("reviews every actual heading, permits independent choices, and applies the batch exactly once after confirmation", () => {
	const data = structuredClone(defaultResumeData);
	data.metadata.page.locale = "ar-SA";
	data.sections.experience.title = "قسم إضافي 1";
	data.sections.experience.items = structuredClone(sampleResumeData.sections.experience.items);
	data.sections.education.title = "قسم إضافي 2";
	data.sections.education.items = structuredClone(sampleResumeData.sections.education.items);
	const issues = buildIssues(lintResumeForAts(data), data).filter(
		(issue) => issue.finding.code === "NON_STANDARD_SECTION_TITLE",
	);
	expect(issues).toHaveLength(2);
	let preview = prepareIssueFixes(identity, data, issues);
	expect(preview.changes.map((change) => change.before).sort()).toEqual(["قسم إضافي 1", "قسم إضافي 2"]);
	expect(preview.changes.every((change) => typeof change.after === "string" && change.after.trim())).toBe(true);
	preview = chooseFix(preview, 0, "المهارات");
	expect(preview.choices[0]?.value).toBe("المهارات");
	const apply = vi.fn();
	expect(apply).not.toHaveBeenCalled();
	expect(acceptFix(preview, identity, data, apply)).toBe(true);
	expect(apply).toHaveBeenCalledExactlyOnceWith(preview.after);
	expect(preview.after.sections.experience.items).toEqual(data.sections.experience.items);
	expect(preview.after.sections.education.items).toEqual(data.sections.education.items);
	expect(fixIsValid(chooseFix(preview, 0, ""))).toBe(false);
	expect(fixIsValid(chooseFix(preview, 0, "Invented heading"))).toBe(false);
});

it("chooses only personal emails and preserves other people's references and unrelated contact fields", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.email = "owner@work.test";
	data.basics.customFields = [
		{ id: "email", icon: "envelope", text: "owner@home.test", link: "mailto:owner@home.test" },
		{ id: "city", icon: "map-pin", text: "Riyadh", link: "" },
	];
	data.sections.references.items = [
		{
			id: "ref",
			hidden: false,
			name: "Reviewer",
			position: "Manager",
			phone: "",
			description: "reviewer@sirawise.test",
			website: { url: "", label: "", inlineLink: false },
		},
	];
	const choice = primaryEmailChoice(data);
	if (!choice) throw new Error("Expected personal email choices");
	expect(choice.options).toEqual(["owner@work.test", "owner@home.test"]);
	let preview = prepareFix(identity, data, () => {}, [choice]);
	preview = chooseFix(preview, 0, "owner@home.test");
	expect(preview.after.basics.email).toBe("owner@home.test");
	expect(preview.after.basics.customFields).toEqual([data.basics.customFields[1]]);
	expect(preview.after.sections.references).toEqual(data.sections.references);
	expect(data.basics.email).toBe("owner@work.test");
	const apply = vi.fn();
	expect(acceptFix(preview, identity, data, apply)).toBe(true);
	expect(apply).toHaveBeenCalledExactlyOnceWith(preview.after);
});

it("removes the complete mailto URL, including its query", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.email = "owner@work.test";
	data.basics.customFields = [
		{ id: "email", icon: "envelope", text: "Personal", link: "mailto:owner@home.test?subject=Contact" },
	];
	const choice = primaryEmailChoice(data);
	if (!choice) throw new Error("Expected an email choice");
	const preview = prepareFix(identity, data, () => {}, [choice]);
	expect(preview.after.basics.customFields).toEqual([{ ...data.basics.customFields[0], link: "" }]);
});

it("clears multiple emails after the approved fix in a newly rendered PDF", async () => {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "Jane Doe";
	data.basics.email = "jane@example.test";
	data.basics.customFields = [
		{ id: "email", icon: "envelope", text: "jane@other.test", link: "mailto:jane@other.test" },
	];
	data.metadata.layout.pages = [{ fullWidth: true, main: [], sidebar: [] }];
	const status = async (resume: typeof data) => {
		const file = await createResumePdfFile({ data: resume, filename: "resume.pdf" });
		const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), fontExtraProperties: true });
		try {
			const pdf = (await task.promise) as unknown as PdfDocumentLike;
			const raw = await harvestPdfDocument(pdf, {
				file: { name: file.name, sizeBytes: file.size, magicBytesOk: true },
			});
			return analyzePdfResume(raw).checks.find((check) => check.code === "MULTIPLE_EMAILS")?.status;
		} finally {
			await task.destroy();
		}
	};
	const choice = primaryEmailChoice(data);
	if (!choice) throw new Error("Expected personal email choices");
	const preview = prepareFix(identity, data, () => {}, [choice]);
	expect(await status(data)).toBe("fail");
	expect(await status(preview.after)).toBe("pass");
}, 30_000);

it("refuses no-op fixes and erased headings even without choice metadata", () => {
	const data = structuredClone(defaultResumeData);
	data.sections.experience.title = "Actual heading";
	expect(fixIsValid(prepareFix(identity, data, () => {}))).toBe(false);
	const preview = prepareFix(identity, data, (draft) => {
		draft.sections.experience.title = "";
	});
	expect(acceptFix(preview, identity, data, vi.fn())).toBe(false);
});
