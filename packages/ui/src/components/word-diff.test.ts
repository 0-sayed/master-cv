import { expect, it } from "vite-plus/test";
import { diffWords, tokenizeDiff, shouldStackDiff } from "./word-diff";

it.each([
	[
		"Body text: 8 pt",
		"Body text: 10 pt",
		[
			["equal", "Body text: "],
			["removed", "8"],
			["added", "10"],
			["equal", " pt"],
		],
	],
	[
		"Use clear text",
		"Use clear plain text",
		[
			["equal", "Use clear "],
			["added", "plain "],
			["equal", "text"],
		],
	],
	[
		"Use clear plain text",
		"Use clear text",
		[
			["equal", "Use clear "],
			["removed", "plain "],
			["equal", "text"],
		],
	],
	[
		"رحلتي",
		"الخبرة",
		[
			["removed", "رحلتي"],
			["added", "الخبرة"],
		],
	],
	[
		"تصدير PDF بعلامات: متوقف",
		"تصدير PDF بعلامات: مفعّل عند دعمه",
		[
			["equal", "تصدير PDF بعلامات: "],
			["removed", "متوقف"],
			["added", "مفعّل عند دعمه"],
		],
	],
	[
		"PDF: قديم 2022",
		"PDF: جديد 2022",
		[
			["equal", "PDF: "],
			["removed", "قديم"],
			["added", "جديد"],
			["equal", " 2022"],
		],
	],
] as const)("compares %s with %s at word boundaries", (before, after, expected) => {
	expect(diffWords(before, after).map(({ type, value }) => [type, value])).toEqual(expected);
});

it.each([
	["", "New text"],
	["Old text", ""],
	["Same text", "Same text"],
	["Remove old text and old heading.", "Use clear text and clear heading."],
	["a  b\nc", "a b\nd"],
])("preserves both inputs exactly: %s / %s", (before, after) => {
	const parts = diffWords(before, after);
	expect(
		parts
			.filter((part) => part.type !== "added")
			.map((part) => part.value)
			.join(""),
	).toBe(before);
	expect(
		parts
			.filter((part) => part.type !== "removed")
			.map((part) => part.value)
			.join(""),
	).toBe(after);
});

it("retains unchanged words between separate edits", () => {
	const parts = diffWords("Old title and old summary", "New title and new summary");
	expect(parts).toContainEqual({ type: "equal", value: " title and " });
});

it.each([
	"01/2020",
	"2020-01-31",
	"1,234.50",
	"https://example.com/a?b=2",
	"www.example.com/cv",
	"name@example.com",
	"+966 50 123 4567",
	"(966) 50 123 4567",
	"٠١/٢٠٢٠",
	"١٬٢٣٤٫٥٠",
])("keeps %s atomic", (token) => {
	expect(tokenizeDiff(token)).toEqual([token]);
	expect(diffWords(`Value: ${token}`, "Value: يناير 2020")).toContainEqual({ type: "removed", value: token });
});
it.each([
	["تصدير PDF بعلامات: متوقف", "تصدير PDF بعلامات: مفعّل عند دعمه", false],
	["Body text: 8 pt", "Body text: 10 pt", false],
	["a b c d e", "a x c y e", false],
	["a b c d e", "a x y z e", true],
	["one old two old three old four old five", "one new two new three new four new five", true],
	["Old shared interior text end", "New shared interior text finish", true],
	["لا يوجد ملف أعمال أو رابط مهني ذو صلة", "رابط يعرض أعمالي وملف مهني واضح ومناسب", true],
])("chooses readable layout for %s", (before, after, stacked) => {
	expect(shouldStackDiff(before, after)).toBe(stacked);
});
