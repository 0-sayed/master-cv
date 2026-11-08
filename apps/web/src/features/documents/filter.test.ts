import type { DocumentSummary } from "./filter";
import { describe, expect, it } from "vite-plus/test";
import { collectTags, filterDocuments } from "./filter";
function document(id: string, name: string): DocumentSummary {
	return {
		id,
		name,
		type: "resume",
		tags: [name],
		isLocked: false,
		isPublic: false,
		slug: null,
		trashedAt: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		application: null,
	};
}
const filters = { type: "all", q: "", tags: [], sort: "name" } as const;
describe("document comparison", () => {
	it.each(["ar-SA", "en-US"] as const)(
		"searches shaped Arabic and digit alphabets without changing titles in %s",
		(locale) => {
			const data = [document("a", "سِـيرة ٢")];
			expect(filterDocuments(data, { ...filters, q: "سيرة ۲" }, locale)).toEqual(data);
			expect(data[0]?.name).toBe("سِـيرة ٢");
		},
	);
	it("sorts numbers naturally and resolves equal titles by stable ID", () => {
		const data = [document("b", "Resume 2"), document("a", "Resume 2"), document("c", "Resume 10")];
		expect(filterDocuments(data, filters, "en-US").map((row) => row.id)).toEqual(["a", "b", "c"]);
		expect(collectTags(data, "en-US")).toEqual(["Resume 2", "Resume 10"]);
	});
	it("keeps timestamp ordering primary", () => {
		const data = [document("a", "A"), { ...document("b", "Z"), updatedAt: new Date(1000) }];
		expect(filterDocuments(data, { ...filters, sort: "edited" }, "ar-SA").map((row) => row.id)).toEqual(["b", "a"]);
	});
});
