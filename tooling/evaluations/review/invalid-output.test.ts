import { expect, it } from "vite-plus/test";
import { auditInvalidOutput } from "./invalid-output";

const proposal = {
	id: "p",
	passageId: "selected",
	text: "Recorded orders; checked stock.",
	reason: "Clearer",
	evidenceIds: ["selected"],
	claims: [{ id: "c", text: "Recorded orders; checked stock.", evidenceIds: ["selected"] }],
};
it("identifies the undocumented semicolon segmentation without accepting or rewriting the output", () => {
	const audit = auditInvalidOutput("wording", JSON.stringify({ proposals: [proposal], questions: [], notes: [] }));
	expect(audit.issues).toEqual([{ path: ["proposals", 0], message: "Uncited proposed text", code: "custom" }]);
	expect(audit.failureClass).toBe("prompt-claim-boundaries");
});
it("keeps missing text, duplicate claim IDs and unknown citations as genuine model errors", () => {
	for (const claims of [
		[{ id: "c", text: "Recorded orders;", evidenceIds: ["selected"] }],
		[
			{ id: "c", text: "Recorded orders;", evidenceIds: ["selected"] },
			{ id: "c", text: "checked stock.", evidenceIds: ["selected"] },
		],
		[{ id: "c", text: proposal.text, evidenceIds: ["invented"] }],
	])
		expect(
			auditInvalidOutput("wording", JSON.stringify({ proposals: [{ ...proposal, claims }], questions: [], notes: [] }))
				.failureClass,
		).toBe("model-error");
});
it("reports original extraction validation paths and field names without alias repair", () => {
	const value = {
		candidates: [
			{
				id: "c",
				section: "experience",
				entityId: "e",
				field: "jobTitle",
				value: "Engineer",
				rawDateText: null,
				evidenceIds: ["selected"],
				confirmation: "needs_review",
			},
		],
		questions: [],
	};
	const audit = auditInvalidOutput("extraction", JSON.stringify(value));
	expect(audit.failureClass).toBe("prompt-extraction-contract");
	expect(audit.issues).toContainEqual({
		path: ["candidates", 0],
		message: "Invalid extraction field/value",
		code: "custom",
	});
});
