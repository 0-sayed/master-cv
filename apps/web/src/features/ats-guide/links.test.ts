import { expect, it } from "vite-plus/test";
import { atsGuideRuleHref } from "./links";

it("links PDF and structured rules to the shared guide anchors", () => {
	expect(atsGuideRuleHref("NO_EMAIL")).toBe("/dashboard/review-guide?tab=ats#rule-NO_EMAIL");
	expect(atsGuideRuleHref("MISSING_EMAIL")).toBe("/dashboard/review-guide?tab=data#rule-MISSING_EMAIL");
});
