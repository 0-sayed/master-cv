import { z } from "zod";
import { blockText, replaceBlockText } from "@reactive-resume/resume/proposals";
import { hashReviewTarget } from "@reactive-resume/resume/review-evidence";
import { splitReviewClaims, reviewClaimsSchema, type ReviewResult } from "@reactive-resume/schema/resume/ai-review";
import fixtures from "./fixtures.json";
import holdout from "./holdout.json";
import { buildModelPayload, reviewHandlers, validateReviewResult } from "./production";
import questionEquivalences from "./question-equivalences.json";
import { factPosition, scoreReviewCase, type ReviewCase, type ReviewCaseScore } from "./score";

const fixtureSchema = z.object({
	id: z.string(),
	passageId: z.string(),
	sector: z.string(),
	missingField: z.string(),
	question: z.string(),
	questionTargets: z.array(z.string()),
	clarity: z.object({ lead: z.string(), remove: z.string(), maxWords: z.number() }),
	language: z.enum(["ar", "en", "mixed"]),
	category: z.enum(["wording", "extraction", "missing-info", "injection", "translation", "job-evidence"]),
	kind: z.enum(["wording", "extraction"]),
	input: z.string(),
	intent: z.string(),
	safeText: z.string(),
	acceptableOutputs: z.array(z.string()).min(1),
	forbiddenPatterns: z.array(z.string()),
	improvementExpected: z.boolean(),
	difficulty: z.enum(["easy", "medium", "hard"]),
	combined: z.boolean(),
	holdout: z.boolean(),
	exploratory: z.boolean(),
	attack: z.string().nullable(),
	forbiddenClaims: z.array(z.string()),
	requiredFacts: z.array(z.string()),
	factAlternatives: z.record(z.string(), z.array(z.string())).optional(),
	structure: z.string().optional(),
	task: z.string().optional(),
	requiresQuestion: z.boolean(),
	extraction: z
		.object({
			section: z.enum(["experience", "education", "certifications", "skills"]),
			field: z.string(),
			value: z.unknown(),
			rawDateText: z.string().nullable(),
		})
		.optional(),
});
export const cases = z.array(fixtureSchema).parse([...fixtures, ...holdout]);
export type BenchmarkCase = z.infer<typeof fixtureSchema>;
/** Reviewed semantic concepts, never unconstrained stemming or a topic-only match. */
function matchesQuestion(c: BenchmarkCase, prompt: string): boolean {
	// Assess the actual interrogative, not a separate "not supplied; do not guess" explanation.
	const questions = prompt.match(/[^.!?؟؛;\n]*[?؟]/gu) ?? [];
	return questions.some(
		(question) =>
			!/(?<!\p{L})(?:not|never|unhandled|لم|ليس|غير)(?!\p{L})/iu.test(
				question.replace(/\bnot (?:recorded|specified|supplied|stated|known)\b|غير ذلك/giu, ""),
			) &&
			c.questionTargets.some((target) => {
				const control = questionEquivalences.controls.find((row) => row.target === target);
				if (!control) return false;
				const requests = control.requests === "count" ? questionEquivalences.countRequests : control.requests;
				return (
					control.topics.some((topic) => factPosition(question, topic) >= 0) &&
					(requests as string[]).some(
						(request) =>
							factPosition(question, request) >= 0 || (target === "الجرد" && factPosition(question, "كم مرة") >= 0),
					)
				);
			}),
	);
}
export function prepareCase(c: BenchmarkCase) {
	const source = {
		kind: c.kind === "extraction" ? ("import" as const) : ("resume" as const),
		id: "synthetic-cv",
		revision: "synthetic-v1",
	};
	const target = { sectionId: "summary", field: "content" };
	const evidence: ReviewCase["sources"] = [
		{
			id: "selected",
			source,
			target: c.kind === "wording" ? target : null,
			quote: c.input,
			factId: null,
			factRevision: null,
			confirmation: c.kind === "wording" ? "confirmed" : "source_unconfirmed",
		},
	];
	const selections = [
		{
			id: "selected",
			kind: c.kind === "wording" ? ("confirmed_content" as const) : ("unconfirmed_source" as const),
			section: c.kind === "wording" ? "summary" : (c.extraction?.section ?? "experience"),
			text: c.input,
		},
	];
	const snapshot = { source, evidence, selections, expiresAt: null, partial: false };
	const handler = reviewHandlers[c.kind === "wording" ? "review.wording" : "review.extraction"];
	const payload = buildModelPayload({
		selections: [...selections, { id: "intent", kind: "user_supplied", section: "summary", text: c.intent }],
		contactValues: [],
	});
	const gold: ReviewCase = {
		id: c.id,
		language: c.language,
		input: c.input,
		sources: evidence,
		supportedClaims: [c.safeText],
		forbiddenClaims: c.forbiddenClaims,
		forbiddenPatterns: c.forbiddenPatterns,
		requiredFacts: c.requiredFacts,
		factAlternatives: c.factAlternatives ?? {},
		unknownFields: [],
		citations: [],
	};
	return { snapshot, handler, payload, gold, target };
}
export function goldOutput(c: BenchmarkCase): Record<string, unknown> {
	const questions = c.requiresQuestion
		? [
				{
					id: "q",
					passageId: c.kind === "wording" ? "selected" : null,
					prompt: c.question,
					evidenceIds: ["selected"],
				},
			]
		: [];
	if (c.kind === "extraction")
		return {
			candidates: [
				{
					id: "c",
					entityId: "synthetic-role",
					...c.extraction,
					evidenceIds: ["selected"],
					confirmation: "needs_review",
				},
			],
			questions,
		};
	return {
		proposals: c.requiresQuestion
			? []
			: [
					{
						id: "p",
						passageId: "selected",
						text: c.safeText,
						reason: c.language === "en" ? "Preserves supplied facts." : "صياغة تحافظ على الحقائق.",
						evidenceIds: ["selected"],
						claims: splitReviewClaims(c.safeText, ["selected"]),
					},
				],
		questions,
		notes: [],
	};
}
export type Evaluation = {
	schemaValid: boolean;
	structuralFailure?: boolean;
	retentionApplicable?: boolean;
	noChangeProposed?: boolean;
	/** null until independent verification judges the reason against the task. */
	noChangeHonest?: boolean | null;
	guardAccepted: boolean;
	guardError: string | null;
	missingQuestion: boolean;
	emptyAnswer: boolean;
	usefulnessMiss: boolean;
	score: ReviewCaseScore | null;
	result: ReviewResult | null;
};
export function evaluateOutput(c: BenchmarkCase, raw: unknown): Evaluation {
	const { handler, snapshot, gold, target } = prepareCase(c);
	const evaluation: Evaluation = {
		schemaValid: false,
		structuralFailure: true,
		retentionApplicable: false,
		noChangeProposed: false,
		noChangeHonest: null,
		guardAccepted: false,
		guardError: null,
		missingQuestion: c.requiresQuestion,
		emptyAnswer: false,
		usefulnessMiss: c.improvementExpected,
		score: null,
		result: null,
	};
	const parsed = handler.output.safeParse(raw);
	if (!parsed.success) return evaluation;
	evaluation.schemaValid = true;
	evaluation.structuralFailure = false;
	try {
		// Only provenance/materialization is local; schemas, markup and semantic validation are production code.
		const data = parsed.data;
		const questions = z
			.array(
				z.object({
					id: z.string(),
					passageId: z.string().nullable(),
					prompt: z.string(),
					evidenceIds: z.array(z.string()),
				}),
			)
			.parse(data.questions);
		if (questions.some((q) => q.passageId !== null && q.passageId !== "selected"))
			throw new Error("AI_INVALID_PASSAGE");
		const common = {
			schemaVersion: 2 as const,
			sourceRevision: snapshot.source,
			evidence: snapshot.evidence,
			questions: questions.map((q) => ({
				id: q.id,
				target: q.passageId === null ? null : target,
				prompt: q.prompt,
				evidenceIds: q.evidenceIds,
			})),
		};
		let result: ReviewResult;
		if (c.kind === "wording") {
			const proposals = z
				.array(
					z.object({
						id: z.string(),
						passageId: z.string(),
						text: z.string(),
						claims: reviewClaimsSchema,
						reason: z.string(),
						evidenceIds: z.array(z.string()),
					}),
				)
				.parse(data.proposals);
			if (proposals.some((p) => p.passageId !== "selected" || !p.evidenceIds.includes("selected")))
				throw new Error("AI_INVALID_PASSAGE");
			const before = replaceBlockText("<p>source</p>", c.input);
			result = {
				...common,
				kind: "wording",
				notes: z.array(z.string()).parse(data.notes),
				proposals: proposals.map((p) => ({
					schemaVersion: 2,
					id: p.id,
					target,
					location: "summary",
					before,
					after: replaceBlockText(before, p.text),
					why: p.reason,
					status: "pending",
					source: "improve",
					base: snapshot.source,
					targetHash: hashReviewTarget(before),
					evidenceIds: p.evidenceIds,
					claims: p.claims,
				})),
			};
		} else {
			result = {
				...common,
				kind: "extraction",
				candidates: z
					.array(z.custom<Extract<ReviewResult, { kind: "extraction" }>["candidates"][number]>())
					.parse(data.candidates),
			};
		}
		evaluation.result = result;
		const subjects = result.kind === "wording" ? result.proposals : result.candidates;
		evaluation.retentionApplicable =
			result.kind === "wording" ? subjects.length > 0 : result.candidates.some((c) => c.value !== null);
		evaluation.noChangeProposed =
			result.kind === "wording" && !subjects.length && !result.questions.length && result.notes.some((n) => n.trim());
		evaluation.score = scoreReviewCase(!subjects.length ? { ...gold, requiredFacts: [] } : gold, result);
		const plain = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
		const improved =
			result.kind === "wording" &&
			result.proposals.some((p) => {
				const text = plain(blockText(p.after));
				const factOrder = (s: string) =>
					c.requiredFacts
						.map((fact, i) => ({
							i,
							position: Math.min(
								...[fact, ...(c.factAlternatives?.[fact] ?? [])].map((f) => factPosition(s, f)).filter((n) => n >= 0),
							),
						}))
						.filter((f) => Number.isFinite(f.position))
						.sort((a, b) => a.position - b.position)
						.map((f) => f.i)
						.join(",");
				const reordered =
					c.task?.startsWith("reorder") &&
					factOrder(c.safeText) !== factOrder(c.input) &&
					factOrder(text) === factOrder(c.safeText);
				return (
					!evaluation.score?.lostFacts.length &&
					(c.acceptableOutputs.some((s) => plain(s) === text) ||
						reordered ||
						(plain(c.input).includes(plain(c.clarity.remove)) &&
							!text.includes(plain(c.clarity.remove)) &&
							text.split(/\s+/u).length < plain(c.input).split(/\s+/u).length))
				);
			});
		evaluation.usefulnessMiss = c.improvementExpected && !improved;
		evaluation.missingQuestion = c.requiresQuestion && !result.questions.some((q) => matchesQuestion(c, q.prompt));
		evaluation.emptyAnswer =
			!subjects.length &&
			!result.questions.length &&
			!(result.kind === "wording" && result.notes.some((n) => n.trim()));
		validateReviewResult(snapshot, result);
		evaluation.guardAccepted = true;
	} catch (error) {
		evaluation.guardError =
			error instanceof Error && /^AI_[A-Z_]+$/u.test(error.message) ? error.message : "AI_INVALID_RESULT";
	}
	return evaluation;
}
