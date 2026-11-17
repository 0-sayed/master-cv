import type { TaskCase } from "../types";
import type { InterviewPrepOutput } from "./contract";
import { expect, it } from "vite-plus/test";
import { required } from "../../required";
import { loadStudyCases, studyReviewItems } from "../../study";
import { tasksVerifierSchema } from "../verifier/schema";
import { tasksVerifier } from "../verifier/verifier";
import { interviewQuestionAssessment } from "./question-assessment";

const interviewCases = studyReviewItems("tasks-v1", loadStudyCases("tasks-v1")).filter(
	(c) => c.kind === "task" && c.category === "interview-prep",
) as TaskCase[];
function probe(notes: string[] = [], source = required(interviewCases.find((c) => c.language === "ar"))) {
	const c = structuredClone(source);
	const output = structuredClone(c.gold) as InterviewPrepOutput;
	output.questions = output.questions.slice(0, 5);
	output.questions.push({
		id: "q6",
		text: "كيف أدرت فريقًا من عشرة موظفين؟",
		kind: "experience",
		basis: { cvEvidenceIds: [required(c.cv[0]).id], jobSpanIds: [] },
		premises: [],
	});
	output.notes = notes;
	const verdict = tasksVerifierSchema.parse(tasksVerifier.fakeVerdict(c, output));
	verdict.verdicts = verdict.verdicts.map((v) => ({ ...v, verdict: "supported" }));
	verdict.premises = verdict.premises.map((p) => ({
		...p,
		verdict:
			p.id === "question:q6"
				? "unsupported"
				: output.questions.some((q) => p.id === `question:${q.id}` && q.premises.length > 0)
					? "supported"
					: "no_candidate_premise",
	}));
	verdict.coverage = { status: "uncovered", reason: "Question q6 assumes team leadership." };
	return { c, output, verdict };
}

it("retains the same five questions for English identifiers, ordinal wording and Arabic explanations", () => {
	expect(interviewCases).toHaveLength(48);
	for (const c of interviewCases) {
		const { output, verdict } = probe([], c);
		for (const reason of [
			"Question q6 assumes team leadership.",
			"The final question assumes team leadership.",
			"السؤال السادس يفترض إدارة فريق.",
		]) {
			const raw = { ...verdict, coverage: { status: "uncovered", reason } };
			expect(tasksVerifier.auditFault(c, output, raw), c.id).toBeNull();
			const assessment = interviewQuestionAssessment(c, output, raw);
			expect(assessment.safeQuestionIds, c.id).toEqual(output.questions.slice(0, 5).map((q) => q.id));
			expect(assessment.accepted, c.id).toBe(true);
		}
	}
});

it("requires a separate structured verdict for nonempty notes and rejects candidate claims outside questions", () => {
	const { c, output, verdict } = probe(["أدار المرشح فريقًا من عشرة موظفين."]);
	const outside = verdict.premises.find((p) => p.id === "outside-questions");
	expect(outside).toBeDefined();
	const missing = { ...verdict, premises: verdict.premises.filter((p) => p.id !== "outside-questions") };
	expect(tasksVerifier.auditFault(c, output, missing)).not.toBeNull();
	for (const status of ["unsupported", "unclear", "supported"] as const) {
		const raw = {
			...verdict,
			premises: verdict.premises.map((p) => (p.id === "outside-questions" ? { ...p, verdict: status } : p)),
		};
		expect(interviewQuestionAssessment(c, output, raw).accepted).toBe(false);
	}
});

it("filters by the supplied question ID without assuming ordinal or numeric identifiers", () => {
	const { c, output, verdict } = probe();
	required(output.questions[5]).id = "leadership-gap";
	verdict.premises = verdict.premises.map((p) =>
		p.id === "question:q6" ? { ...p, id: "question:leadership-gap" } : p,
	);
	verdict.coverage.reason = "السؤال الأخير يفترض إدارة فريق.";
	expect(tasksVerifier.auditFault(c, output, verdict)).toBeNull();
	expect(interviewQuestionAssessment(c, output, verdict).accepted).toBe(true);
});

it("retains five questions with safe task guidance but rejects an unlocalized aggregate failure", () => {
	const { c, output, verdict } = probe(["استخدم الأسئلة للتدرب على المقابلة."]);
	expect(interviewQuestionAssessment(c, output, verdict).accepted).toBe(true);
	const inconsistent = {
		...verdict,
		premises: verdict.premises.map((p) => ({ ...p, verdict: "no_candidate_premise" })),
	};
	expect(interviewQuestionAssessment(c, output, inconsistent).accepted).toBe(false);
});

it("accepts Arabic prose with protected technical identifiers", () => {
	const { c, output, verdict } = probe();
	c.cv = [
		...c.cv,
		{
			id: "technical",
			section: "skills",
			text: "PostgreSQL TypeScript JavaScript Kubernetes",
			protected: [
				{ kind: "skill", text: "PostgreSQL" },
				{ kind: "skill", text: "TypeScript" },
				{ kind: "skill", text: "JavaScript" },
				{ kind: "skill", text: "Kubernetes" },
			],
		},
	];
	required(output.questions[0]).text = "كيف تستخدم PostgreSQL TypeScript JavaScript Kubernetes؟";
	expect(interviewQuestionAssessment(c, output, verdict).safeQuestionIds).toContain(required(output.questions[0]).id);
});
it("rejects English notes in an Arabic deliverable even without candidate claims", () => {
	const { c, output, verdict } = probe(["Use these questions to prepare for your next interview."]);
	expect(interviewQuestionAssessment(c, output, verdict).accepted).toBe(false);
});
it("keeps q10 basis failures when a different q1 question is rejected", async () => {
	const { interviewPrepContract } = await import("./contract");
	const { c, output, verdict } = probe();
	required(output.questions[0]).id = "q10";
	const cvId = required(required(output.questions[0]).basis.cvEvidenceIds[0]);
	required(output.questions[0]).basis.cvEvidenceIds = [cvId, cvId];
	const rejected = required(output.questions[5]);
	const old = rejected.id;
	rejected.id = "q1";
	verdict.premises = verdict.premises.map((p) => (p.id === `question:${old}` ? { ...p, id: "question:q1" } : p));
	// Keep five safe questions but fail the separate q10 basis validation.
	const extra = structuredClone(required(output.questions[1]));
	extra.id = "safe-extra";
	output.questions.push(extra);
	const raw = tasksVerifierSchema.parse(tasksVerifier.fakeVerdict(c, output));
	raw.premises = raw.premises.map((p) => (p.id === "question:q1" ? { ...p, verdict: "unsupported" } : p));
	raw.coverage = { status: "uncovered", reason: "Rejected q1" };
	expect(interviewPrepContract.score(c, output, raw).safetyDeterministic.pass).toBe(false);
});
