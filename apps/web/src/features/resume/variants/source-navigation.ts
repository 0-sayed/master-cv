import type { EditorSelection } from "../editor/store";
import type { ProposalTarget } from "@reactive-resume/schema/resume/ai-review";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { buildJobPassages } from "@reactive-resume/resume/ats";
/** URL targets are hints: resolve only a field still visible in this document. */
export function resolveSourceSelection(data: ResumeData, target: ProposalTarget): EditorSelection | null {
	const passage = buildJobPassages(data).find(
		({ target: current }) =>
			current.sectionId === target.sectionId &&
			current.itemId === target.itemId &&
			current.roleId === target.roleId &&
			current.field === target.field,
	);
	if (!passage) return null;
	if (target.sectionId === "basics") return { kind: "header" };
	return target.itemId
		? { kind: "item", sectionId: target.sectionId, itemId: target.itemId }
		: { kind: "section", sectionId: target.sectionId };
}
