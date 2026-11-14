import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { buildTranslationInventory, writeTranslationTarget } from "./translation";

it("inventories visible prose and headings, keeps contacts/dates hidden content local, and blocks unsupported custom prose", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.headline = "مهندس";
	data.basics.email = "private@example.test";
	data.summary.content = "<p>لم أدر ميزانية.</p>";
	data.summary.hidden = false;
	data.summary.title = "نبذة";
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	const inventory = buildTranslationInventory(data);
	expect(inventory.segments.map((segment) => segment.target)).toEqual(
		expect.arrayContaining([
			{ sectionId: "basics", field: "headline" },
			{ sectionId: "summary", field: "content" },
			{ sectionId: "summary", field: "title" },
		]),
	);
	expect(JSON.stringify(inventory)).not.toContain("private@example.test");
	expect(inventory.blocking).toEqual([]);
	writeTranslationTarget(data, { sectionId: "basics", field: "headline" }, "Engineer");
	writeTranslationTarget(data, { sectionId: "summary", field: "content" }, "Did not manage a budget.");
	expect(data.basics.email).toBe("private@example.test");
	expect(data.basics.headline).toBe("Engineer");
	expect(data.summary.content).toBe("<p>Did not manage a budget.</p>");
	expect(() => writeTranslationTarget(data, { sectionId: "basics", field: "email" } as never, "changed")).toThrow();
});
