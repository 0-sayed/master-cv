import { describe, expect, it } from "vite-plus/test";
import { atsReviewOutputSchema } from "./ats-review";

describe("atsReviewOutputSchema", () => {
	it("keeps the good entries when one is malformed", () => {
		const parsed = atsReviewOutputSchema.parse({
			summary: "Reads clearly.",
			suggestions: [
				{ section: null, issue: "Vague bullet.", rewrite: null, impact: "shouty" },
				{ section: null, issue: "", rewrite: null, impact: "low" },
			],
			strengths: ["Good", ""],
			jdAlignment: { verdict: "Close fit.", missingConcepts: ["kubernetes"], strengths: [] },
		});

		expect(parsed.suggestions).toHaveLength(1);
		expect(parsed.suggestions[0]?.impact).toBe("medium");
		expect(parsed.strengths).toEqual(["Good"]);
		expect(parsed.jdAlignment?.missingConcepts).toEqual(["kubernetes"]);
	});
});

it("denies direct contact-bearing reviews before provider lookup", async () => {
	const { reviewResumeText } = await import("./ats-review");
	await expect(
		reviewResumeText({
			provider: "openai",
			model: "unused",
			apiKey: "unused",
			baseURL: "",
			extractedText: "synthetic.private@example.test",
			findings: [],
			passages: [],
		}),
	).rejects.toMatchObject({ code: "FORBIDDEN" });
});
