import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import z from "zod";
import { env } from "@reactive-resume/env/server";
import { generateFilename } from "@reactive-resume/utils/file";
import { protectedProcedure } from "../../context";
import { consumePdfExportLimit } from "../../middleware/rate-limit";
import { parseStoredResumeData } from "./resume-data-validation";
import { resumeService } from "./service";

export { createResumePdfDownloadUrl, verifyResumePdfDownloadToken } from "./pdf-download-url";

type CreateResumePdfDownloadInput = {
	id: string;
	userId: string;
	resHeaders?: Headers;
	expectedUpdatedAt?: string;
};

export async function createResumePdfDownload(input: CreateResumePdfDownloadInput) {
	const resume = await resumeService.getById({ id: input.id, userId: input.userId });
	if (input.expectedUpdatedAt && resume.updatedAt.toISOString() !== input.expectedUpdatedAt)
		throw new ORPCError("CONFLICT", { message: "The document changed. Request a new download link." });
	await consumePdfExportLimit(input);
	const data = parseStoredResumeData(resume.data);
	const filename = generateFilename(resume.name, "pdf");

	try {
		// Lazy-load the PDF renderer (@reactive-resume/pdf → the Forme WASM engine and
		// the icon drawings) only when a PDF is actually exported, instead of at server
		// boot. Keeps cold starts light on constrained/slow-disk hosts.
		const { createResumePdfFile } = await import("@reactive-resume/pdf/server");
		const body = await createResumePdfFile({ data, filename, uploadOrigin: env.APP_URL });

		const current = await resumeService.getById({ id: input.id, userId: input.userId });
		if (current.updatedAt.getTime() !== resume.updatedAt.getTime())
			throw new ORPCError("CONFLICT", { message: "The document changed during export. Try again." });
		const hash = createHash("sha256")
			.update(Buffer.from(await body.arrayBuffer()))
			.digest("hex");
		return {
			headers: {
				"content-disposition": `attachment; filename="${filename}"`,
				"x-resume-revision": resume.updatedAt.toISOString(),
				"x-pdf-sha256": hash,
			},
			body,
		};
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		if (error instanceof Error && error.cause === "pdf-text-loss") {
			throw new ORPCError("BAD_REQUEST", { message: error.message });
		}
		console.error("[PDF API] Failed to render resume PDF", { resumeId: input.id });
		throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to generate resume PDF" });
	}
}

export const downloadResumePdfProcedure = protectedProcedure
	.route({
		method: "GET",
		path: "/resumes/{id}/pdf",
		tags: ["Resumes"],
		operationId: "downloadResumePdf",
		summary: "Download resume as PDF",
		description:
			"Generates a PDF for the specified resume and returns it as a forced download. Only resumes belonging to the authenticated user can be downloaded. Requires authentication.",
		successDescription: "The generated resume PDF.",
		outputStructure: "detailed",
	})
	.input(
		z.object({
			id: z.string().describe("The ID of the resume."),
			target: z
				.literal("resume")
				.optional()
				.describe("Deprecated, only `resume`: cover letters are documents of their own (`/cover-letters`)."),
		}),
	)
	.output(
		z.object({
			headers: z.object({
				"content-disposition": z.string(),
				"x-resume-revision": z.string(),
				"x-pdf-sha256": z.string(),
			}),
			body: z.file().mime("application/pdf"),
		}),
	)
	.handler(({ context, input }) =>
		createResumePdfDownload({
			id: input.id,
			userId: context.user.id,
			...(context.resHeaders && { resHeaders: context.resHeaders }),
		}),
	);
