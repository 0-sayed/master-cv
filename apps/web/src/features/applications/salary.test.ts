import { expect, it } from "vite-plus/test";
import { splitSalary } from "./salary";

it("preserves the original SAR range endpoints", () => {
	expect(splitSalary("27000–33000 SAR / شهر")).toEqual({
		kind: "sar-range",
		lower: "27000",
		upper: "33000",
		period: "شهر",
	});
});
it("recognizes the English fixture without inventing a period", () => {
	expect(splitSalary("34000–40000 SAR / month")).toEqual({
		kind: "sar-range",
		lower: "34000",
		upper: "40000",
		period: "month",
	});
	expect(splitSalary("34000-40000 SAR")).toEqual({ kind: "sar-range", lower: "34000", upper: "40000", period: null });
});
it.each([
	"Negotiable + bonus",
	"33000–27000 SAR / شهر",
	"10–20 USD",
	"1,2–30 SAR",
	"10–20–30 SAR",
	"-10–20 SAR",
	"1.5–3 SAR",
])("preserves ambiguous input: %s", (text) => {
	expect(splitSalary(text)).toEqual({ kind: "text", text });
});
