import z from "zod";
import { protectedProcedure } from "../../context";
import { documentsDto } from "../../dto/documents";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { paginate } from "../../pagination";
import { getPersonalToolsAvailability, requirePersonalTool } from "../personal-tools/availability";
import { documentsService } from "./service";

const route = (
	method: "GET" | "POST" | "DELETE",
	path: `/${string}`,
	operationId: string,
	summary: string,
	description: string,
) => ({
	method,
	path,
	tags: ["Documents"],
	operationId,
	summary,
	description: `${description} Requires authentication.`,
});

/** Resumes and saved cover letters as one library: list, rename, tag, lock, link, Trash and Copy for a job. */
export const documentsRouter = {
	list: protectedProcedure
		.route(
			route(
				"GET",
				"/documents",
				"listDocuments",
				"List documents",
				"Returns the user's resumes and saved cover letters (or those in Trash), newest edit first, with the job application each was made for.",
			),
		)
		.input(documentsDto.list.input)
		.output(documentsDto.list.output)
		.handler(async ({ context, input }) =>
			paginate(
				await documentsService.list({
					userId: context.user.id,
					trashed: input.trashed,
					includeLetters: getPersonalToolsAvailability().coverLetters,
				}),
				input,
				context.resHeaders,
			),
		),

	counts: protectedProcedure
		.route(
			route(
				"GET",
				"/documents/counts",
				"countDocuments",
				"Count documents",
				"Counts live resumes and letters, and everything in Trash.",
			),
		)
		.input(z.object({}).optional())
		.output(documentsDto.counts.output)
		.handler(({ context }) =>
			documentsService.counts({ userId: context.user.id, includeLetters: getPersonalToolsAvailability().coverLetters }),
		),

	rename: protectedProcedure
		.route(route("POST", "/documents/rename", "renameDocument", "Rename a document", "Renames a resume or letter."))
		.input(documentsDto.rename.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.rename.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			return documentsService.rename({ ...input, userId: context.user.id });
		}),

	setTags: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/tags",
				"setDocumentTags",
				"Set a document's tags",
				"Replaces a resume's or letter's tags.",
			),
		)
		.input(documentsDto.setTags.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.setTags.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			return documentsService.setTags({ ...input, userId: context.user.id });
		}),

	setLocked: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/lock",
				"lockDocument",
				"Lock or unlock a document",
				"Locks a resume or letter against edits and Trash, or unlocks it.",
			),
		)
		.input(documentsDto.setLocked.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.setLocked.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			return documentsService.setLocked({ ...input, userId: context.user.id });
		}),

	linkApplication: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/application",
				"linkDocumentApplication",
				"Link a document to an application",
				"Records the job application a resume or letter was made for, or clears it.",
			),
		)
		.input(documentsDto.linkApplication.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.linkApplication.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			requirePersonalTool("applications");
			return documentsService.linkApplication({ ...input, userId: context.user.id });
		}),

	trash: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/trash",
				"trashDocument",
				"Move a document to Trash",
				"Moves a resume or letter to Trash, where it stays for 30 days. A resume in Trash isn't shared. Locked documents can't be moved.",
			),
		)
		.input(documentsDto.trash.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.trash.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			return documentsService.trash({ ...input, userId: context.user.id });
		}),

	restore: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/restore",
				"restoreDocument",
				"Restore a document",
				"Brings a document back from Trash.",
			),
		)
		.input(documentsDto.restore.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.restore.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			return documentsService.restore({ ...input, userId: context.user.id });
		}),

	purge: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/purge",
				"purgeDocument",
				"Delete a document now",
				"Permanently deletes a document that is already in Trash.",
			),
		)
		.input(documentsDto.purge.input)
		.use(resumeMutationRateLimit)
		.output(documentsDto.purge.output)
		.handler(({ context, input }) => {
			if (input.type === "letter") requirePersonalTool("coverLetters");
			return documentsService.purge({ ...input, userId: context.user.id });
		}),

	copyForJob: protectedProcedure
		.route(
			route(
				"POST",
				"/documents/copy-for-job",
				"copyResumeForJob",
				"Copy a resume for a job",
				"Duplicates a resume and links the copy to a job application. Saved jobs select the copy; submitted document history is preserved.",
			),
		)
		.input(documentsDto.copyForJob.input)
		.use(({ next }) => {
			requirePersonalTool("applications");
			return next();
		})
		.use(resumeMutationRateLimit)
		.output(documentsDto.copyForJob.output)
		.handler(({ context, input }) => documentsService.copyForJob({ ...input, userId: context.user.id })),
};
