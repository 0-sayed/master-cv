import { describe, expect, it } from "vite-plus/test";
import { getProductName, productBrand } from "./brand";

describe("product branding", () => {
	it("defines the approved product names, domain and sender", () => {
		expect(productBrand).toEqual({
			name: "Sirawise",
			uppercaseName: "SIRAWISE",
			arabicName: "سيراوايز",
			primaryDomain: "sirawise.io",
			defaultEmailSender: "Sirawise <noreply@sirawise.io>",
		});
	});
	it("selects Arabic only for Arabic interface locales", () => {
		for (const locale of ["ar", "ar-SA"]) expect(getProductName(locale)).toBe("سيراوايز");
		for (const locale of ["en", "en-US", "de", ""]) expect(getProductName(locale)).toBe("Sirawise");
	});
});
