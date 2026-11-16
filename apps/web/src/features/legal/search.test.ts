import { expect, it } from "vite-plus/test";
import { legalSearchSchema } from "./search";
it.each([undefined, "refunds", ["terms"], { tab: "terms" }])("recovers unsupported tab %j", (tab) => {
	expect(legalSearchSchema.parse({ tab })).toEqual({ tab: "privacy" });
});
it("preserves the terms deep link", () => {
	expect(legalSearchSchema.parse({ tab: "terms" })).toEqual({ tab: "terms" });
});
