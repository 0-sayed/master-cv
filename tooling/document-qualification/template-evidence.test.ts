import { expect, it } from "vite-plus/test";
import * as templates from "@reactive-resume/schema/templates";
import evidence from "./fixtures/regressions/round5-template-support.json";

it("keeps the beta diagnostic subset within matrix support and excludes known template blockers", () => {
	expect(evidence.cases).toHaveLength(templates.templateSchema.options.length * 3);
	expect(new Set(evidence.cases.map((item) => item.id)).size).toBe(evidence.cases.length);
	for (const template of templates.templateSchema.options) {
		expect(
			evidence.cases
				.filter((item) => item.template === template)
				.map((item) => item.language)
				.sort(),
		).toEqual(["ar", "en", "mixed"]);
	}
	const expected = templates.templateSchema.options.filter((template) =>
		["ar", "mixed"].every((language) =>
			evidence.cases.some((item) => item.template === template && item.language === language && item.automatedPass),
		),
	);
	// Meowth loses numbered employer identity; Persian changes English name case.
	// Kakuna and Smeargle already fail the supporting AR/mixed matrix intersection.
	expect(templates).toHaveProperty(
		"arabicMixedDiagnosticTemplates",
		expected.filter((template) => template !== "meowth" && template !== "persian"),
	);
});
