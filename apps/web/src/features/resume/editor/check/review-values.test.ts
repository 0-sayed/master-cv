import { beforeEach, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { formatReviewValue } from "./review-values";
import { getUiLocaleMessages } from "@/libs/locale";

beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
const data = structuredClone(defaultResumeData);
const format = (path: string, value: unknown) => formatReviewValue(path.split("."), value, data);

it("names visibility and toggle states by their field", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	expect(format("picture.hidden", false).text).toBe("ظاهرة");
	expect(format("picture.hidden", true).text).toBe("مخفية");
	expect(format("sections.experience.hidden", false).text).toBe("ظاهر");
	expect(format("sections.experience.hidden", true).text).toBe("مخفي");
	expect(format("metadata.typography.hyphenation", true).text).toBe("مفعّل");
	expect(format("metadata.typography.hyphenation", false).text).toBe("متوقف");
});

it("uses Arabic plurals and Latin digits for points, millimeters and line height", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	expect(format("metadata.typography.body.fontSize", 10).text).toBe("10 نقاط");
	expect(format("metadata.typography.body.fontSize", 11).text).toBe("11 نقطة");
	expect(format("metadata.page.marginX", 14).text).toBe("14 مم");
	expect(format("metadata.typography.body.lineHeight", 1.5).text).toContain("1.5");
});

it("uses layout words, template names and section titles instead of identifiers", () => {
	expect(format("sections.experience.columns", 2).text).toBe("Two columns");
	expect(format("metadata.layout.pages.0.fullWidth", true).text).toBe("One column");
	expect(format("metadata.template", "onyx").text).toBe("Onyx");
	expect(format("metadata.layout.pages.0.main", ["experience"]).text).toBe("Experience");
});

it("formats dates in the CV language and date format regardless of the interface", () => {
	const cv = structuredClone(data);
	cv.metadata.page.locale = "en-US";
	cv.metadata.page.dateFormat = "numeric";
	expect(
		formatReviewValue(
			["sections", "experience", "items", "0", "dates"],
			{ start: "2022-03", end: "2024-05", present: false },
			cv,
		).text,
	).toBe("03/2022 – 05/2024");
	expect(formatReviewValue(["sections", "experience", "items", "0", "dates", "start"], "2022-03", cv).text).toBe(
		"03/2022",
	);
});

it("marks colors and technical values for swatches and isolated tokens", () => {
	expect(format("metadata.design.colors.text", "rgba(0, 0, 0, 1)")).toMatchObject({
		kind: "color",
		text: "Black",
		color: "rgba(0, 0, 0, 1)",
	});
	expect(format("basics.email", "name@example.test")).toMatchObject({ kind: "token", text: "name@example.test" });
	expect(format("basics.website.url", "https://example.test")).toMatchObject({
		kind: "token",
		text: "https://example.test",
	});
});

it.each([
	true,
	false,
	null,
	undefined,
	"true",
	"false",
	"null",
	"undefined",
	"[object Object]",
	'{"hidden":true}',
	["unresolved-id"],
	{ hidden: true },
	"b8901a1c-dfc8-46de-ae2c-6b538a92db75",
])("never leaks raw data for %j", (value) => {
	for (const path of ["unknown", "picture.hidden", "metadata.template", "sections.experience.id"]) {
		expect(format(path, value).text).not.toMatch(
			/^(?:true|false|null|undefined|\[object Object\]|[{[].*[\]}]|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}|unresolved-id)$/i,
		);
	}
});
