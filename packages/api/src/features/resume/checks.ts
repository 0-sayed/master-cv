import z from "zod";
import { ATS_CATEGORIES, ATS_RULE_CODES, lintResumeForAts } from "@reactive-resume/resume/ats";
import { matchJobDescription, surfaceFormsOf } from "@reactive-resume/resume/ats-pdf";
import { buildMarkdown } from "@reactive-resume/resume/markdown";
import { protectedProcedure } from "../../context";
import { jobTermSchema, pdfCheckSchema } from "../../dto/pdf-check";
import { pdfAnalysisRateLimit } from "../../middleware/rate-limit";
import { checkOwnedPdf, ownedPdfCheckInput } from "./check-owned-pdf";
import { resumeService } from "./service";

const finding = z.object({
	code: z.enum(ATS_RULE_CODES),
	severity: z.enum(["error", "warning", "info"]),
	pointer: z.string(),
	key: z.string(),
	params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export const checkResume = protectedProcedure
	.route({
		method: "GET",
		path: "/resumes/{id}/checks",
		tags: ["Resumes"],
		operationId: "getResumeChecks",
		summary: "Check resume content for ATS issues",
		description:
			"Runs the editor's deterministic contact, date, layout, heading and writing checks. Respects ignored findings saved on the resume.",
	})
	.input(z.object({ id: z.string().min(1) }))
	.output(
		z.object({
			findings: z.array(finding).readonly(),
			ignored: z.array(finding).readonly(),
			counts: z.object({ error: z.number(), warning: z.number(), info: z.number() }),
			totalRules: z.number(),
			passedRules: z.number(),
			score: z.number(),
			categories: z.record(z.enum(ATS_CATEGORIES), z.object({ total: z.number(), passed: z.number() })),
		}),
	)
	.handler(async ({ input, context }) =>
		lintResumeForAts((await resumeService.getById({ id: input.id, userId: context.user.id })).data),
	);

export const checkPdf = protectedProcedure
	.route({
		method: "POST",
		path: "/pdf-checks",
		tags: ["Checks"],
		operationId: "createPdfCheck",
		summary: "Check an owned CV PDF",
		description:
			"Authenticated native PDF checking for a current owned, non-trashed CV revision. Up to 25 MB and 30 pages. Partial coverage stays partial. No extracted text or file is stored.",
	})
	.input(ownedPdfCheckInput)
	.output(
		pdfCheckSchema.extend({
			source: z.object({
				ownerId: z.string(),
				resumeId: z.string(),
				baseRevision: z.string(),
				editGeneration: z.number(),
				contentHash: z.string(),
				bytesHash: z.string(),
				versions: ownedPdfCheckInput.shape.artifact.shape.versions,
			}),
		}),
	)
	.use(pdfAnalysisRateLimit)
	.handler(({ input, context, signal }) => checkOwnedPdf(context.user.id, input, signal));

export const matchResume = protectedProcedure
	.route({
		method: "POST",
		path: "/resumes/{id}/job-matches",
		tags: ["Checks"],
		operationId: "createResumeJobMatch",
		summary: "Match resume terms to a job posting",
		description:
			"Runs the editor's deterministic term matching and respects terms hidden on this resume. No AI provider is needed.",
	})
	.input(z.object({ id: z.string().min(1), jobDescription: z.string().trim().min(1).max(20_000) }))
	.output(
		z.object({
			found: z.array(jobTermSchema.extend({ label: z.string() })),
			missing: z.array(jobTermSchema.extend({ label: z.string() })),
			total: z.number(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { data } = await resumeService.getById({ id: input.id, userId: context.user.id });
		const hidden = new Set(data.metadata.check?.hiddenTerms ?? []);
		const terms = matchJobDescription({ jobDescription: input.jobDescription, resumeText: buildMarkdown(data) })
			.terms.filter((term) => !hidden.has(term.term))
			.map((term) => ({
				...term,
				label:
					surfaceFormsOf(term.term)
						.map((form) => input.jobDescription.match(new RegExp(RegExp.escape(form), "i"))?.[0])
						.find(Boolean) ?? term.term,
			}));
		return {
			found: terms.filter((term) => term.resumeCount > 0),
			missing: terms.filter((term) => term.resumeCount === 0),
			total: terms.length,
		};
	});
