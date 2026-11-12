import { expect, it } from "vite-plus/test";
import { getAiAvailability, assertLegacyAiDenied, getOperationHandler } from "./route-policy";

it("keeps real processing disabled regardless of environment credentials or request flags", () => {
	expect(getAiAvailability()).toEqual({ state: "not_enabled", reason: "NO_APPROVED_ROUTE" });
	expect(() => assertLegacyAiDenied()).toThrow();
	expect(() => getOperationHandler("arbitrary-tool")).toThrow();
});
