import type { Claim, TaskCase, TaskContract, TaskScore } from "../types";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { HARD_FACTS_VERSION } from "@reactive-resume/api/features/ai/hard-facts";
import { buildModelPayload } from "../../production";
import { guardTaskClaims } from "../guard";
import { tasksVerifier } from "../verifier/verifier";

export const coverLetterHardFactsVersion = HARD_FACTS_VERSION;

const identifier = z.string().trim().min(1).max(200);
const claimFields = {
	id: identifier,
	text: z.string().trim().min(1).max(2000),
	evidenceIds: z.array(identifier).min(1).max(50),
	kind: z.literal("fact"),
};
const claimSchema = z.union([
	z.strictObject(claimFields),
	z.strictObject({ ...claimFields, jobSpanIds: z.array(identifier).min(1).max(50) }),
]);
export const coverLetterOutputSchema = z.strictObject({
	paragraphs: z
		.array(
			z.strictObject({
				text: z.string().trim().min(1).max(8000),
				claims: z.array(claimSchema).max(30),
			}),
		)
		.min(1)
		.max(4),
	notes: z.array(z.string().trim().min(1).max(600)).max(5),
});
export type CoverLetterOutput = z.infer<typeof coverLetterOutputSchema>;

/** The production editor stores body paragraphs only; greeting and sign-off are separate fields. */
export function renderPlainText(output: CoverLetterOutput): string {
	return output.paragraphs.map((p) => p.text).join("\n\n");
}

/** Arabic proclitics stay attached; isolated punctuation is not a word. No language-dependent segmentation. */
export function countLetterWords(text: string): number {
	return text
		.trim()
		.split(/\s+/u)
		.filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function protectedNames(c: TaskCase): string[] {
	return [...new Set(c.cv.flatMap((f) => f.protected?.filter((p) => p.kind === "name").map((p) => p.text) ?? []))]
		.filter((name) => name.trim())
		.sort((a, b) => b.length - a.length || a.localeCompare(b));
}
export function restoreCoverLetterNames(c: TaskCase, output: CoverLetterOutput): CoverLetterOutput {
	const names = protectedNames(c);
	const restore = (text: string) =>
		text.replace(/\[NAME_(\d+)\]/gu, (placeholder, n: string) => names[Number(n) - 1] ?? placeholder);
	return {
		paragraphs: output.paragraphs.map((p) => ({
			text: restore(p.text),
			claims: p.claims.map((claim) => ({ ...claim, text: restore(claim.text), evidenceIds: [...claim.evidenceIds] })),
		})),
		notes: output.notes.map(restore),
	};
}
const guardPolicy = { lostFact: false, subsetEntities: true };
const compact = (text: string) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const sentences = (text: string) =>
	compact(text)
		.split(/(?<=[.!?؟])\s+/u)
		.filter(Boolean);
const placeholders = /\[[^\]\n]+\]|\{[^}\n]+\}|<[^>\n]+>|\b(?:TODO|TBD|INSERT\s+(?:COMPANY|NAME))\b/iu;
const formatting = /(?:^|\n)\s*(?:#{1,6}\s|[-*•]\s|\d+[.)]\s)|\*\*|```|\[[^\]]+\]\([^)]+\)/u;
const salutation =
	/(?:^|\n)\s*(?:dear\b|hello\b|hi[,!]|to\s+whom\s+it\s+may\s+concern|(?:kind|best)\s+regards\b|sincerely\b|yours\s+(?:faithfully|sincerely)\b|السلام\s+عليكم|تحية\s+طيبة|السادة\b|عزيزي\b|عزيزتي\b|مع\s+(?:خالص|أطيب)\s+(?:التحية|التقدير)|وتفضلوا\b)/iu;
// Assessment language only. A supported achievement may legitimately contain a percentage.
const assessment =
	/\bATS\s+(?:score|rating|pass)|\b(?:match|matching|fit)\s+(?:score|percentage|probability)|\b(?:hiring|employment|acceptance)\s+(?:probability|chance|guarantee)|\b(?:chance|probability)\s+of\s+(?:being\s+hired|hiring|employment)|(?:درجة|نسبة)\s*(?:المطابقة|التوافق|التطابق|اجتياز)|احتمال(?:ية)?\s*(?:التوظيف|القبول)|(?:يضمن|ضمان)\s*(?:التوظيف|القبول)/iu;
const assertedLack =
	/\b(?:you|candidate|applicant)\s+(?:(?:do|does)\s+not\s+(?:know|have)|lack\w*|cannot)|(?:أنت|انت|المرشح|المتقدم)\s+(?:لا\s+(?:يجيد|تجيد|يعرف|تعرف|يمتلك|تمتلك)|يفتقر|تفتقر)/iu;

function score(c: TaskCase, output: CoverLetterOutput, verdict: unknown | null): TaskScore {
	const reasons: string[] = [];
	const body = renderPlainText(output);
	const restored = restoreCoverLetterNames(c, output);
	const claims = restored.paragraphs.flatMap((p) => p.claims);
	const ids = claims.map((claim) => claim.id);
	if (new Set(ids).size !== ids.length) reasons.push("LETTER_DUPLICATE_CLAIM_ID");
	const sourceIds = new Set(c.cv.map((f) => f.id));
	const jobIds = c.jobAd?.segments.map((s) => s.id) ?? [];
	if (
		sourceIds.size !== c.cv.length ||
		new Set(jobIds).size !== jobIds.length ||
		jobIds.some((id) => sourceIds.has(id))
	)
		reasons.push("LETTER_EVIDENCE_COLLISION");
	for (const paragraph of output.paragraphs) {
		const available = sentences(paragraph.text);
		let previous = -1;
		for (const claim of paragraph.claims) {
			const i = available.findIndex((sentence, index) => compact(sentence) === compact(claim.text) && index > previous);
			if (i < 0) reasons.push(`LETTER_CLAIM_NOT_SENTENCE:${claim.id}`);
			else previous = i;
			if (new Set(claim.evidenceIds).size !== claim.evidenceIds.length)
				reasons.push(`LETTER_DUPLICATE_EVIDENCE:${claim.id}`);
		}
	}
	if (placeholders.test(body)) reasons.push("LETTER_PLACEHOLDER");
	if (formatting.test(body) || output.paragraphs.some((p) => /[\r\n]/u.test(p.text)))
		reasons.push("LETTER_NOT_PLAIN_PARAGRAPHS");
	if (output.paragraphs.some((p) => salutation.test(p.text))) reasons.push("LETTER_GREETING_OR_SIGNOFF");
	for (const text of [body, ...output.notes]) {
		if (assessment.test(text)) reasons.push("LETTER_D22_ASSESSMENT");
		if (assertedLack.test(text)) reasons.push("LETTER_ASSERTED_SKILL_ABSENCE");
	}
	reasons.push(...guardTaskClaims(c, claims, guardPolicy).details);
	if (verdict !== null) {
		try {
			const fault = tasksVerifier.auditFault(c, output, verdict);
			if (fault) reasons.push(fault);
			else if (!tasksVerifier.assess(c, output, verdict as Record<string, unknown>).accepted)
				reasons.push("LETTER_VERIFIER_REJECTED");
		} catch {
			reasons.push("LETTER_INVALID_VERIFIER");
		}
	}
	const words = countLetterWords(body);
	const length = words >= 180 && words <= 320;
	const paragraphs = output.paragraphs.length >= 3 && output.paragraphs.length <= 4;
	return {
		caseId: c.id,
		structuralFailure: false,
		missingQuestion: false,
		emptyAnswer: !body.trim(),
		safetyDeterministic: { pass: reasons.length === 0, reasons },
		quality: {
			metric: "body-length-and-paragraph-compliance",
			value: length && paragraphs ? 1 : 0,
			pass: length && paragraphs,
		},
		lostFacts: [],
		unsupportedClaims: reasons,
	};
}

export const coverLetterContract: TaskContract<TaskCase, CoverLetterOutput> = {
	category: "cover-letter",
	promptVersion: "t006-cover-letter-v2-cited-bridge",
	schemaVersion: "t006-cover-letter-schema-v2",
	systemPrompt: readFileSync(new URL("./prompt.md", import.meta.url), "utf8"),
	outputSchema: coverLetterOutputSchema,
	guardPolicy,
	visibleCap: () => 4096,
	verifierCap: 12288,
	deadlineMs: 120_000,
	buildInput: (c) => {
		const names = protectedNames(c);
		return buildModelPayload({
			selections: c.cv.length
				? c.cv.map((f) => ({
						id: f.id,
						kind: "confirmed_content",
						section: f.section,
						text: names.reduce((text, name, i) => text.replaceAll(name, `[NAME_${i + 1}]`), f.text),
					}))
				: [
						{
							id: "letter-empty-cv",
							kind: "user_supplied",
							section: "summary",
							text: "No confirmed CV facts supplied. Do not draft candidate assertions; explain missing evidence in notes.",
						},
					],
			contactValues: [],
		});
	},
	claims: (_c, output): Claim[] =>
		output.paragraphs.flatMap((p) => p.claims.map((claim) => ({ ...claim, evidenceIds: [...claim.evidenceIds] }))),
	verifierContext: () => ({
		retention: "not_applicable",
		absenceChecks: [],
		taskInstruction:
			"Draft only the plain-text cover-letter body for B-C10. Independently read EVERY sentence in paragraphs and every note, including unannotated text; require full sentence-level coverage of every candidate factual assertion. Annotations must copy the entire factual sentence and cite CV facts only. Detect omissions, hidden or detached claims, strengthened responsibility, dropped negation and job-only skills such as SAP. Job spans can establish the role and employer, NEVER candidate experience. For cover-letter and tailoring only, a non-assertive sentence may link cited CV facts to advertised duties when its separate jobSpanIds cite that duty wording and it asserts no new candidate fact, skill, metric or responsibility. Check the CV proposition using evidenceIds only and check the job reference against jobSpanIds; never merge the evidence pools. A bridge claiming a job-ad skill as the candidate's own, such as خبرتي في SAP المطلوبة في إعلانكم, is unsupported without CV evidence. Independently verify relational relevance; the deterministic bridge grammar does not prove semantic support. Motivation, job references and the conversation invitation are not candidate facts and need no CV claim; reject invented company facts too. Notes must contain no candidate assertions. D22 forbids ATS scores, match percentages, hiring probabilities and assertions that absent evidence means lack of skill. Do not treat legitimate supported achievement percentages as assessment scores. Quality checks (advisory): 180–320 whitespace words with Arabic clitics attached, three or four paragraphs, natural Saudi professional Arabic or posting language (otherwise CV language), role and employer mentioned in body when supplied, two or three supported specifics, no greeting/sign-off/formatting/placeholders, short conversation invitation. Omitted unselected CV facts are allowed; revision modes are outside this T007/T008 draft contract.",
	}),
	score,
};
