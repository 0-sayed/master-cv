import z from "zod";
import { applicationStatusSchema } from "@reactive-resume/schema/applications/data";
import { templateSchema } from "@reactive-resume/schema/templates";
import { paginationShape } from "../pagination";

const documentTypeSchema = z.enum(["resume", "letter"]).describe("resume, or letter (a saved cover letter).");
const documentRefSchema = z.object({
	type: documentTypeSchema,
	id: z.string().min(1).describe("The ID of the resume or cover letter."),
});

export const documentIdentitySchema = z.object({
	template: templateSchema,
	locale: z.string().min(1),
	accent: z.string(),
});

const documentSchema = z.object({
	type: documentTypeSchema,
	id: z.string(),
	name: z.string(),
	tags: z.array(z.string()),
	isLocked: z.boolean(),
	isPublic: z.boolean().describe("Whether a resume's public link is on; always false for letters."),
	slug: z.string().nullable().describe("A resume's public address, /{username}/{slug}; null for letters."),
	trashedAt: z.date().nullable().describe("When the document moved to Trash; null while it's live."),
	createdAt: z.date(),
	updatedAt: z.date(),
	metadata: documentIdentitySchema.nullable(),
	letterStatus: z.enum(["draft", "sent"]).nullable(),
	application: z
		.object({ id: z.string(), company: z.string(), role: z.string(), status: applicationStatusSchema })
		.nullable()
		.describe("The job application this document was made for, if any."),
});

export type DocumentSummary = z.infer<typeof documentSchema>;

export const documentsDto = {
	list: {
		input: z
			.object({
				...paginationShape,
				trashed: z.boolean().default(false).describe("List the documents in Trash instead."),
			})
			.default({ trashed: false }),
		output: z.array(documentSchema),
	},
	counts: {
		input: z.void(),
		output: z.object({ resume: z.number(), letter: z.number(), trash: z.number() }),
	},
	rename: {
		input: documentRefSchema.extend({ name: z.string().trim().min(1).max(100) }),
		output: z.void(),
	},
	setTags: {
		input: documentRefSchema.extend({ tags: z.array(z.string().trim().min(1).max(40)).max(20) }),
		output: z.void(),
	},
	setLocked: {
		input: documentRefSchema.extend({ isLocked: z.boolean() }),
		output: z.void(),
	},
	linkApplication: {
		input: documentRefSchema.extend({
			applicationId: z.string().min(1).nullable().describe("The application to link, or null to unlink."),
		}),
		output: z.void(),
	},
	trash: { input: documentRefSchema, output: z.void() },
	restore: { input: documentRefSchema, output: z.void() },
	purge: { input: documentRefSchema, output: z.void() },
	copyForJob: {
		input: z.object({
			resumeId: z.string().min(1).describe("The resume to copy."),
			applicationId: z.string().min(1).optional().describe("The job the copy is for; omit for no job yet."),
			name: z.string().trim().min(1).max(100).optional().describe("Defaults to “{source} — {company}”."),
		}),
		output: z.string().describe("The ID of the copy."),
	},
};
