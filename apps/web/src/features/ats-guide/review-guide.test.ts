import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { ATS_RULE_CODES } from "@reactive-resume/resume/ats";
import { PDF_ATS_RULE_CODES } from "@reactive-resume/resume/ats-pdf";
import { AI_GUIDE_FEATURES } from "./ai-features";
import { reviewGuideRedirect, reviewGuideSearch, atsGuideRuleHref } from "./links";
import { layoutMapNodes } from "./map-geometry";
import { GUIDE_AREAS, filterGuideEntries, loadGuideEntries } from "./model";

it("permanently redirects old links without losing search or rule anchors", () => {
	expect(reviewGuideRedirect({ searchStr: "?rule=MISSING_EMAIL&locale=ar-SA", hash: "rule-NO_EMAIL" })).toEqual({
		href: "/dashboard/review-guide?rule=MISSING_EMAIL&locale=ar-SA#rule-NO_EMAIL",
		statusCode: 308,
		replace: true,
	});
});
it("accepts the three URL tabs and recovers invalid tabs", () => {
	for (const tab of ["ats", "data", "ai"]) expect(reviewGuideSearch({ tab }).tab).toBe(tab);
	expect(reviewGuideSearch({ tab: "unknown", rule: "MISSING_EMAIL" })).toEqual({ tab: "ats", rule: "MISSING_EMAIL" });
	expect(atsGuideRuleHref("MISSING_EMAIL")).toContain("?tab=data#rule-MISSING_EMAIL");
	expect(atsGuideRuleHref("NO_EMAIL")).toContain("?tab=ats#rule-NO_EMAIL");
});
it("keeps category order consistent and separates the two catalogs", async () => {
	expect(GUIDE_AREAS).toEqual(["contact", "sections", "content", "dates", "parseability", "layout"]);
	const entries = await loadGuideEntries();
	for (const [source, codes] of [
		["pdf", PDF_ATS_RULE_CODES],
		["editor", ATS_RULE_CODES],
	] as const) {
		const result = filterGuideEntries(entries, { area: null, query: "", type: "all", source });
		expect(result).toHaveLength(codes.length);
		expect(new Set(result.map((entry) => entry.code))).toEqual(new Set(codes));
		const indices = result.map((entry) => GUIDE_AREAS.indexOf(entry.area));
		expect(indices).toEqual([...indices].sort((a, b) => a - b));
	}
});
it("lists every user-facing writer task with no internal exclusions", async () => {
	const configuration = JSON.parse(
		readFileSync(new URL("../../../../../packages/api/src/features/ai/writer-config.json", import.meta.url), "utf8"),
	);
	const internalTasks: string[] = [];
	expect(new Set(AI_GUIDE_FEATURES.map((feature) => feature.id))).toEqual(
		new Set(Object.keys(configuration).filter((id) => !internalTasks.includes(id))),
	);
	const layout = layoutMapNodes(AI_GUIDE_FEATURES);
	expect(layout.filter((feature) => feature.bank === "start")).toHaveLength(5);
	expect(layout.filter((feature) => feature.bank === "end")).toHaveLength(4);
	for (const bank of ["start", "end"]) {
		const anchors = layout.filter((feature) => feature.bank === bank).map((feature) => feature.anchor);
		expect(anchors).toEqual([...anchors].sort((a, b) => a - b));
		expect(new Set(anchors).size).toBe(anchors.length);
	}
});
