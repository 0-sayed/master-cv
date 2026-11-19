import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { SarAmount, SarSymbol } from "./sar-amount";
it("exposes the approved vector independently for salary ranges", () => {
	render(<SarSymbol currencyLabel="ريال سعودي" />);
	expect(screen.getByRole("img", { name: "ريال سعودي" })).toHaveAttribute("viewBox", "0 0 9.84224 11");
});
describe("SarAmount", () => {
	it.each(["ar-SA", "en-US"] as const)("keeps exact minor units and an accessible currency in %s", (locale) => {
		render(<SarAmount minorUnits={Number.MAX_SAFE_INTEGER} locale={locale} currencyLabel="Saudi riyal" />);
		expect(screen.getByText("90,071,992,547,409.91")).toBeVisible();
		expect(screen.getByLabelText("Saudi riyal")).toHaveAttribute("viewBox", "0 0 9.84224 11");
	});
	it.each([-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid amount %s", (minorUnits) => {
		expect(() => render(<SarAmount minorUnits={minorUnits} locale="en-US" currencyLabel="Saudi riyal" />)).toThrow(
			RangeError,
		);
	});
});
