import { describe, expect, it } from "vite-plus/test";
import { slugify, toUsername } from "./string";

describe("slugify", () => {
	it("falls back to a non-empty slug for CJK input", () => {
		expect(slugify("中文简历")).not.toBe("");
	});
});

describe("toUsername", () => {
	it("removes characters outside [a-z0-9._-]", () => {
		expect(toUsername("  John!@#Doe$%^  ")).toBe("johndoe");
		expect(toUsername("john.doe_test-123")).toBe("john.doe_test-123");
	});

	it("truncates to 64 characters max", () => {
		const longName = "a".repeat(100);
		expect(toUsername(longName)).toHaveLength(64);
	});
});

it("normalizes only Arabic and Persian numeric alphabets", async () => {
	const { normalizeNumericDigits } = await import("./string");
	expect(normalizeNumericDigits("+٩٦٦ (۵۰) ١٢٣-۴۵۶۷ ١٤٤٥ هـ أَحمد")).toBe("+966 (50) 123-4567 1445 هـ أَحمد");
});

it("D33 removes only tashkeel and superscript alef, preserving tatweel abbreviations", async () => {
	const { removeArabicDiacritics } = await import("./string");
	expect(removeArabicDiacritics("أَحْمَدُ ـٰ 1445-1446 هـ صـ بــ")).toBe("أحمد ـ 1445-1446 هـ صـ بــ");
	expect(removeArabicDiacritics("\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670")).toBe("");
});
