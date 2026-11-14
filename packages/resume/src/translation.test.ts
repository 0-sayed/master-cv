import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { buildTranslationInventory, translationStructureMatches, writeTranslationTarget } from "./translation";

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
			{ sectionId: "summary", field: "content", blockIndex: 0 },
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

it("translates repeated paragraphs and nested list blocks independently without flattening their structure", () => {
	const data = structuredClone(defaultResumeData);
	data.summary.hidden = false;
	data.summary.content = "<p>One</p><p>One</p><ul><li><p>Two</p></li><li>Three</li></ul>";
	data.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	const segments = buildTranslationInventory(data).segments.filter((segment) => segment.target.field === "content");
	expect(segments.map((segment) => segment.text)).toEqual(["One", "One", "Two", "Three"]);
	expect(new Set(segments.map((segment) => segment.id)).size).toBe(4);
	segments.forEach((segment, index) => writeTranslationTarget(data, segment.target, `Translated ${index} & safe`));
	expect(data.summary.content).toBe(
		"<p>Translated 0 &amp; safe</p><p>Translated 1 &amp; safe</p><ul><li><p>Translated 2 &amp; safe</p></li><li>Translated 3 &amp; safe</li></ul>",
	);
});

it("detects source/copy translation structure changes while permitting independent wording and metadata", () => {
	const source = structuredClone(defaultResumeData);
	source.summary.hidden = false;
	source.summary.content = "<p>One</p><p>Two</p>";
	source.metadata.layout.pages = [{ fullWidth: false, main: ["summary"], sidebar: [] }];
	const copy = structuredClone(source);
	copy.summary.content = "<p>Independent wording</p><p>Translated wording</p>";
	copy.basics.email = "independent@example.test";
	expect(translationStructureMatches(source, copy)).toBe(true);
	copy.summary.content = "<p>One block</p>";
	expect(translationStructureMatches(source, copy)).toBe(false);
	copy.summary.content = "<p>One</p><p>Two</p><p>Added</p>";
	expect(translationStructureMatches(source, copy)).toBe(false);
});
