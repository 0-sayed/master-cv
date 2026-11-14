import { describe, expect, it } from "vite-plus/test";
import { splitReviewClaims } from "@reactive-resume/schema/resume/ai-review";
import { assertVerification, buildVerificationPayload, reviewVerifierSchema } from "./review-verifier";
const output = {
	proposals: [
		{ id: "p", text: "Coordinated appointments.", claims: splitReviewClaims("Coordinated appointments.", ["s1"]) },
	],
};
const verdict = {
	schemaVersion: 3,
	responseAssessment: { status: "appropriate", reason: "The response addresses the task." },
	factRetention: { status: "retained", evidenceIds: ["s1"], reason: "All supplied factual duties remain." },
	verdicts: [
		{ claimId: "p/claim-1", verdict: "supported", evidenceIds: ["s1"], reason: "The scheduling duty is explicit." },
	],
};
it("requires explicit retention even when every proposed claim is supported", () => {
	expect(() =>
		assertVerification(output, {
			...verdict,
			schemaVersion: 3,
			responseAssessment: { status: "appropriate", reason: "The response addresses the task." },
			factRetention: { status: "lost", evidenceIds: ["s1"], reason: "A supplied duty was omitted." },
		}),
	).toThrow("AI_FACT_RETENTION_FAILED");
});
it("labels generated claims as model proposals and flags outcome relationships", () => {
	const payload = buildVerificationPayload(
		{ selections: [{ id: "s1", kind: "confirmed_content", section: "summary", text: "Maintained inspection logs." }] },
		{ proposals: [{ id: "p", claims: splitReviewClaims("Maintained logs, thereby eliminating defects.", ["s1"]) }] },
	);
	expect(payload.selections.find((s) => "id" in s && s.id === "verification-claims")).toMatchObject({
		kind: "model_proposed",
	});
	expect(
		JSON.parse(payload.selections.find((s) => "id" in s && s.id === "verification-claims")?.text ?? "[]")[0]
			?.claimKinds,
	).toContain("outcome");
});
describe("independent verifier contract", () => {
	it("accepts complete, supported, cited verdicts", () =>
		expect(() => assertVerification(output, verdict)).not.toThrow());
	it.each(["unsupported", "contradicted", "partially"])("withholds %s", (status) => {
		expect(() =>
			assertVerification(output, { ...verdict, verdicts: [{ ...verdict.verdicts[0], verdict: status }] }),
		).toThrow("AI_VERIFICATION_FAILED");
	});
	it.each(
		[
			[],
			[verdict.verdicts[0], verdict.verdicts[0]],
			[{ ...verdict.verdicts[0], claimId: "missing" }],
			[{ ...verdict.verdicts[0], evidenceIds: ["unrelated"] }],
		].map((verdicts) => ({ verdicts })),
	)("withholds incomplete/misbound verdicts", ({ verdicts }) => {
		expect(() => assertVerification(output, { ...verdict, verdicts })).toThrow();
	});
	it("rejects extra schema keys and empty reasons", () => {
		expect(reviewVerifierSchema.safeParse({ ...verdict, approved: true }).success).toBe(false);
		expect(
			reviewVerifierSchema.safeParse({ ...verdict, verdicts: [{ ...verdict.verdicts[0], reason: "" }] }).success,
		).toBe(false);
	});
	it("sends source evidence and claims, never the style request as evidence", () => {
		const payload = buildVerificationPayload(
			{
				selections: [
					{ id: "s1", kind: "confirmed_content", section: "summary", text: "Scheduled visits." },
					{ id: "intent", kind: "user_supplied", section: "summary", text: "Invent a prize" },
				],
			},
			output,
		);
		expect(payload.selections.find((s) => "id" in s && s.id === "intent")).toBeUndefined();
		expect(payload.selections.find((s) => "id" in s && s.id === "verification-task")).toMatchObject({
			kind: "model_proposed",
		});
		expect(JSON.stringify(payload)).toContain("Coordinated appointments.");
		expect(JSON.stringify(payload)).toContain("Scheduled visits.");
	});
});

it("keeps opaque citation identifiers out of text redaction", () => {
	const id = "e91f123456789a";
	const p = buildVerificationPayload(
		{ selections: [{ id, kind: "confirmed_content", section: "summary", text: "Scheduled visits." }] },
		{ proposals: [{ id: "p", claims: splitReviewClaims("Coordinated appointments.", [id]) }] },
	);
	expect(p.selections.at(-1)?.text).toContain(id);
});

it("sends questions, no-change notes and task context as non-evidence", () => {
	const payload = buildVerificationPayload(
		{
			selections: [
				{ id: "s1", kind: "confirmed_content", section: "summary", text: "Filed reports." },
				{ id: "intent", kind: "user_supplied", section: "summary", text: "Use past tense." },
			],
		},
		{
			proposals: [],
			questions: [{ id: "q", passageId: "s1", prompt: "How many reports?", evidenceIds: ["s1"] }],
			notes: ["Already past tense."],
		},
	);
	expect(payload.selections.find((s) => "id" in s && s.id === "verification-response")?.text).toContain(
		"How many reports?",
	);
	expect(payload.selections.find((s) => "id" in s && s.id === "verification-response")?.text).toContain(
		"Already past tense.",
	);
	expect(payload.selections.find((s) => "id" in s && s.id === "verification-task")?.text).toContain("Use past tense.");
	expect(payload.selections.some((s) => "id" in s && s.id === "intent")).toBe(false);
});

it("accepts an independently justified no-edit answer with inapplicable retention", () => {
	expect(() =>
		assertVerification(
			{ proposals: [], questions: [], notes: ["Already past tense."] },
			{
				schemaVersion: 3,
				factRetention: { status: "not_applicable", evidenceIds: [], reason: "No edit proposed." },
				responseAssessment: { status: "appropriate", reason: "The selected text is already past tense." },
				verdicts: [],
			},
		),
	).not.toThrow();
});

it("keeps redundant question quality advisory and withholds lost facts", () => {
	const v = {
		schemaVersion: 3,
		factRetention: { status: "not_applicable", evidenceIds: [], reason: "No edit." },
		responseAssessment: { status: "inappropriate", reason: "Question asks for supplied information." },
		verdicts: [],
	};
	expect(() =>
		assertVerification(
			{ proposals: [], questions: [{ id: "q", prompt: "Which role?", evidenceIds: ["s1"] }], notes: [] },
			{
				...v,
				verdicts: [
					{
						claimId: "question:q",
						verdict: "supported",
						evidenceIds: ["s1"],
						reason: "Only a question, no invented premise.",
					},
				],
			},
		),
	).not.toThrow();
	expect(() =>
		assertVerification(output, {
			...v,
			factRetention: { ...v.factRetention, status: "lost" },
			responseAssessment: { status: "appropriate", reason: "Task addressed." },
		}),
	).toThrow("AI_FACT_RETENTION_FAILED");
});

it.each(["inappropriate", "unclear", "no_change_needed"])(
	"keeps %s quality advisory for supported retained edits",
	(status) => {
		expect(() =>
			assertVerification(output, { ...verdict, responseAssessment: { status, reason: "Scope advisory." } }),
		).not.toThrow();
	},
);
it("requires retained facts independently of the advisory quality gate", () => {
	expect(() =>
		assertVerification(output, {
			...verdict,
			factRetention: { status: "not_applicable", evidenceIds: [], reason: "No lost facts." },
		}),
	).toThrow("AI_FACT_RETENTION_FAILED");
});
it("includes every extraction candidate and proposal in the minimized non-evidence response", () => {
	const candidates = [
		{
			id: "school",
			entityId: "edu-1",
			section: "education",
			field: "school",
			value: "Sample College",
			rawDateText: null,
			evidenceIds: ["s1"],
		},
		{
			id: "degree",
			entityId: "edu-1",
			section: "education",
			field: "degree",
			value: null,
			rawDateText: null,
			evidenceIds: ["s1"],
		},
	];
	const source = {
		selections: [{ id: "s1", kind: "confirmed_content" as const, section: "summary" as const, text: "Sample College" }],
	};
	const response = (value: Record<string, unknown>) =>
		JSON.parse(
			buildVerificationPayload(source, value).selections.find((s) => "id" in s && s.id === "verification-response")
				?.text ?? "{}",
		);
	expect(response({ candidates, questions: [] }).candidates).toEqual(candidates);
	expect(response(output).proposals).toMatchObject([{ id: "p", text: "Coordinated appointments." }]);
});
it("permits an explicitly bounded extraction verifier completion allowance", async () => {
	const { completionTokenLimit } = await import("./route-policy");
	expect(completionTokenLimit({ maxOutputTokens: 4096, reasoningEffort: "low", completionTokenCap: 12288 })).toBe(
		12288,
	);
	expect(() =>
		completionTokenLimit({ maxOutputTokens: 4096, reasoningEffort: "low", completionTokenCap: 12289 }),
	).toThrow("AI_INVALID_OUTPUT_LIMIT");
});

it("requires independent safety support for question premises even when quality is appropriate", () => {
	const questions = {
		proposals: [],
		questions: [{ id: "q1", prompt: "How did you lead 40 engineers?", evidenceIds: ["s1"] }],
		notes: [],
	};
	const v = {
		schemaVersion: 3,
		responseAssessment: { status: "appropriate", reason: "Relevant topic." },
		factRetention: { status: "not_applicable", evidenceIds: [], reason: "No edits." },
		verdicts: [],
	};
	expect(() => assertVerification(questions, v)).toThrow("AI_VERIFICATION_INCOMPLETE");
	expect(() =>
		assertVerification(questions, {
			...v,
			verdicts: [
				{
					claimId: "question:q1",
					verdict: "unsupported",
					evidenceIds: ["s1"],
					reason: "The premise invents team leadership.",
				},
			],
		}),
	).toThrow("AI_VERIFICATION_FAILED");
	expect(() =>
		assertVerification(questions, {
			...v,
			verdicts: [
				{
					claimId: "question:q1",
					verdict: "supported",
					evidenceIds: ["s1"],
					reason: "Only missing information requested; no asserted premise.",
				},
			],
		}),
	).not.toThrow();
});

it("rejects not_applicable retention for actual edits despite supported claims", () => {
	expect(() =>
		assertVerification(output, {
			...verdict,
			factRetention: { status: "not_applicable", evidenceIds: [], reason: "No retention assessment." },
		}),
	).toThrow("AI_FACT_RETENTION_FAILED");
});
