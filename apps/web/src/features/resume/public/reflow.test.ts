import { describe, expect, it } from "vite-plus/test";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { reflowOrder } from "./reflow";

const clone = () => structuredClone(sampleResumeData);

describe("reflowOrder", () => {
	it("leaves out hidden sections and hidden entries", () => {
		const data = clone();
		data.sections.skills.hidden = true;
		const project = data.sections.projects.items[0];
		if (!project) throw new Error("The fixture requires a project");
		const first = { ...project, id: "hidden-project", hidden: true };
		const second = { ...project, id: "visible-project", hidden: false };
		data.sections.projects.items = [first, second];

		const order = reflowOrder(data);
		expect(order.map((section) => section.sectionId)).not.toContain("skills");
		const projects = order.find((section) => section.sectionId === "projects")?.itemIds ?? [];
		expect(projects).not.toContain(first.id);
		expect(projects).toContain(second.id);
	});
});
