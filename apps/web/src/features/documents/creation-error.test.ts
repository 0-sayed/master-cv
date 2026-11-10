import { expect, it } from "vite-plus/test";
import { isBaseCvLimit } from "./creation-error";
it("presents the base CV limit only for the declared server contract", () => {
	expect(isBaseCvLimit({ code: "PRECONDITION_FAILED", data: { reason: "BASE_CV_LIMIT" } })).toBe(true);
	expect(isBaseCvLimit({ code: "FORBIDDEN", message: "BASE_CV_LIMIT" })).toBe(false);
	expect(isBaseCvLimit({ code: "PRECONDITION_FAILED", data: { reason: "OTHER" } })).toBe(false);
});
