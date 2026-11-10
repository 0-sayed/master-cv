import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { changedPreviewTargets } from "./edit-highlight";

it("never highlights initial load, design changes, or identical server echoes", () => {
	const before = structuredClone(defaultResumeData);
	expect(changedPreviewTargets(undefined, before)).toEqual([]);
	const after = structuredClone(before);
	after.metadata.design.colors.primary = "var(--accent)";
	expect(changedPreviewTargets(before, after)).toEqual([]);
	expect(changedPreviewTargets(before, structuredClone(before))).toEqual([]);
});
it("binds content changes to exact header and section targets", () => {
	const before = structuredClone(defaultResumeData);
	const after = structuredClone(before);
	after.basics.name = "سارة العتيبي";
	after.summary.content = "<p>New summary</p>";
	after.sections.skills.title = "مهارات";
	expect(changedPreviewTargets(before, after)).toEqual([
		{ kind: "header" },
		{ kind: "section", sectionId: "summary" },
		{ kind: "section", sectionId: "skills" },
	]);
});
it("uses each custom section's stable ID rather than its possibly duplicated title", () => {
	const before = structuredClone(sampleResumeData);
	const after = structuredClone(before);
	const section = after.customSections[0];
	if (!section) throw new Error("Sample custom section missing");
	section.title = "Additional experience";
	expect(changedPreviewTargets(before, after)).toEqual([{ kind: "section", sectionId: section.id }]);
});
