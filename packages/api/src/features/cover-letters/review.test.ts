import type { GuardContext } from "../ai/variant-types";
import { expect, it } from "vite-plus/test";
import {
	validateLetterOutput,
	letterVerificationInventory,
	letterProposalHtml,
	assertLetterVerification,
	buildLetterWriterPayload,
} from "./review-handler";

const context: GuardContext = {
	category: "cover-letter",
	cv: [{ id: "fact", section: "experience", text: "Built accessible interfaces using TypeScript." }],
	jobAd: { segments: [{ id: "job", text: "Requires TypeScript and ten years of management experience." }] },
};
const supported = {
	paragraphs: [
		{
			text: "Built accessible interfaces using TypeScript.",
			claims: [
				{
					id: "claim",
					text: "Built accessible interfaces using TypeScript.",
					evidenceIds: ["fact"],
					kind: "fact",
				},
			],
		},
	],
	notes: [],
};

it("accepts supported paragraphs and produces safe editor HTML", () => {
	expect(validateLetterOutput(context, supported)).toEqual(supported);
	expect(letterProposalHtml(supported)).toBe("<p>Built accessible interfaces using TypeScript.</p>");
});

it("rejects job-only candidate facts", () => {
	const text = "I have ten years of management experience.";
	expect(() =>
		validateLetterOutput(context, {
			...supported,
			paragraphs: [
				{
					text,
					claims: [
						{
							id: "invented",
							text,
							evidenceIds: ["job"],
							kind: "fact",
						},
					],
				},
			],
		}),
	).toThrow();
});

it("sends every paragraph and note for verification even without writer annotations", () => {
	const output = { paragraphs: [{ text: "I have a PhD.", claims: [] }], notes: ["The candidate managed 90 people."] };
	const inventory = letterVerificationInventory(output);
	expect(inventory.map((item) => item.text)).toEqual([output.paragraphs[0]?.text, output.notes[0]]);
});

it("rejects duplicate claim identities and model HTML", () => {
	expect(() =>
		validateLetterOutput(context, { ...supported, paragraphs: [supported.paragraphs[0], supported.paragraphs[0]] }),
	).toThrow();
	expect(() =>
		validateLetterOutput(context, { paragraphs: [{ text: "<script>alert(1)</script>", claims: [] }], notes: [] }),
	).toThrow();
});

it("rejects incomplete whole-text verification and foreign evidence", () => {
	const unannotated = {
		paragraphs: [{ text: "Managed ten people.", claims: [] }],
		notes: ["A note also needs review."],
	};
	expect(() => assertLetterVerification(context, unannotated, { coverage: "complete", items: [] })).toThrow(
		"LETTER_VERIFICATION_INCOMPLETE",
	);
	const verdict = {
		coverage: "complete",
		items: [
			{ id: "paragraph:0", verdict: "supported", evidenceIds: ["job"], reason: "Job requirement" },
			{ id: "note:0", verdict: "no_candidate_assertion", evidenceIds: [], reason: "Procedural" },
		],
	};
	expect(() => assertLetterVerification(context, unannotated, verdict)).toThrow("LETTER_VERIFICATION_EVIDENCE");
	expect(() =>
		assertLetterVerification(context, unannotated, { ...verdict, items: [verdict.items[0], verdict.items[0]] }),
	).toThrow("LETTER_VERIFICATION_INCOMPLETE");
});
it("passes only explicit language and length parameters to the writer", () => {
	const input = { documentLocale: "ar-SA" as const, length: "short" as const, privateEmail: "private@example.com" };
	const payload = buildLetterWriterPayload(context, input);
	expect(JSON.stringify(payload)).not.toContain(input.privateEmail);
	expect(JSON.stringify(payload)).toContain("ar-SA");
});
