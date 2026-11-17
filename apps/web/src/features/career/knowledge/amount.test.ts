import { expect, it } from "vite-plus/test";
import { parseAmount } from "./amount";
it("accepts the Latin formatted Arabic-interface value and original Arabic input", () => {
	expect(parseAmount("12,345.50", "ar-SA")).toBe(12345.5);
	expect(parseAmount("١٢٬٣٤٥٫٥٠", "ar-SA")).toBe(12345.5);
	expect(parseAmount("12,34.50", "ar-SA")).toBeUndefined();
	expect(parseAmount("", "ar-SA")).toBeNull();
});
