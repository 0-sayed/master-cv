import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { getDocumentFontChoices, getRecommendedFontPairing, FONT_PAIRINGS } from "./presets";

it("keeps all five English pairings and restricts Arabic pairings", () => {
	const data = structuredClone(defaultResumeData);
	expect(getDocumentFontChoices(data).pairings).toHaveLength(5);
	expect(FONT_PAIRINGS).toHaveLength(5);
	data.metadata.page.locale = "ar-SA";
	expect(getDocumentFontChoices(data).families).toEqual(["IBM Plex Sans Arabic", "Cairo"]);
	expect(getDocumentFontChoices(data).pairings.map((p) => p.body)).toEqual(["IBM Plex Sans Arabic", "Cairo"]);
});
it("filters Advanced and presets together using actual text, independent of interface locale", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "Ahmed أحمد";
	expect(getDocumentFontChoices(data).families).toEqual(["IBM Plex Sans Arabic", "Cairo"]);
	expect(getRecommendedFontPairing(data)?.body).toBe("IBM Plex Sans Arabic");
	data.basics.name = "東京";
	expect(getDocumentFontChoices(data).families).toEqual([]);
	expect(getRecommendedFontPairing(data)).toBeNull();
});
it("recommends without mutating an existing unsuitable selection", () => {
	const data = structuredClone(defaultResumeData);
	data.metadata.page.locale = "ar-SA";
	const before = structuredClone(data);
	expect(getRecommendedFontPairing(data)?.body).toBe("IBM Plex Sans Arabic");
	expect(data).toEqual(before);
});
