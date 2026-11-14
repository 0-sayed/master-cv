import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { resolveSourceSelection } from "./source-navigation";
it("resolves a visible cited field without inventing an editor target", () => {
	const data = structuredClone(defaultResumeData);
	data.summary.content = "Visible source";
	expect(resolveSourceSelection(data, { sectionId: "summary", field: "content" })).toEqual({
		kind: "section",
		sectionId: "summary",
	});
	expect(resolveSourceSelection(data, { sectionId: "missing", itemId: "foreign", field: "description" })).toBeNull();
	expect(resolveSourceSelection(data, { sectionId: "basics", field: "email" })).toBeNull();
});
