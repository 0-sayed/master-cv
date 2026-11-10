import type { PageMapTarget } from "@reactive-resume/pdf/page-map";
import type { ResumeData } from "@reactive-resume/schema/resume/data";

/** Compare immutable render snapshots, never a draft newer than the PDF on screen. */
export function changedPreviewTargets(before: ResumeData | undefined, after: ResumeData): PageMapTarget[] {
	if (!before) return [];
	const changed = (left: unknown, right: unknown) => JSON.stringify(left) !== JSON.stringify(right);
	const targets: PageMapTarget[] = [];
	if (changed(before.basics, after.basics) || changed(before.picture, after.picture)) targets.push({ kind: "header" });
	if (changed(before.summary, after.summary)) targets.push({ kind: "section", sectionId: "summary" });
	for (const [sectionId, section] of Object.entries(after.sections)) {
		if (changed(before.sections[sectionId as keyof ResumeData["sections"]], section))
			targets.push({ kind: "section", sectionId });
	}
	for (const section of after.customSections) {
		if (
			changed(
				before.customSections.find((item) => item.id === section.id),
				section,
			)
		)
			targets.push({ kind: "section", sectionId: section.id });
	}
	return targets;
}
