import z from "zod";
import { normalizeNumericDigits } from "@reactive-resume/utils/string";
import { careerSourceSchema } from "./career";
import { resumeDatesSchema, yearMonthSchema } from "./resume/dates";
const reviewedDatesSchema = resumeDatesSchema
	.extend({
		start: z.string().transform(normalizeNumericDigits).pipe(yearMonthSchema).nullable(),
		end: z.string().transform(normalizeNumericDigits).pipe(yearMonthSchema).nullable(),
		present: z.boolean(),
	})
	.refine((value) => !value.start || !value.end || value.start <= value.end, {
		message: "End date must follow start date",
	});
import {
	certificationItemSchema,
	educationItemSchema,
	experienceItemSchema,
	languageItemSchema,
	skillItemSchema,
} from "./resume/data";

/** Only factual fields are writable. Identity, layout and derived date labels belong to CVs. */
export const masterFields = {
	experience: experienceItemSchema.pick({
		company: true,
		position: true,
		location: true,
		dates: true,
		description: true,
	}),
	education: educationItemSchema.pick({
		school: true,
		degree: true,
		area: true,
		grade: true,
		location: true,
		dates: true,
		description: true,
	}),
	skills: skillItemSchema.pick({ name: true, proficiency: true }),
	languages: languageItemSchema.pick({ language: true, fluency: true }),
	certifications: certificationItemSchema.pick({ title: true, issuer: true, dates: true, description: true }),
} as const;

export const masterSectionSchema = z.enum(["experience", "education", "skills", "languages", "certifications"]);

function field<S extends z.infer<typeof masterSectionSchema>, F extends string, V extends z.ZodType>(
	section: S,
	name: F,
	value: V,
) {
	return z.strictObject({
		section: z.literal(section),
		entityId: z.string().min(1).max(64),
		field: z.literal(name),
		value,
		source: careerSourceSchema,
	});
}

export const masterFactInputSchema = z.union([
	field("experience", "company", masterFields.experience.shape.company),
	field("experience", "position", masterFields.experience.shape.position),
	field("experience", "location", masterFields.experience.shape.location),
	field("experience", "dates", reviewedDatesSchema),
	field("experience", "description", masterFields.experience.shape.description),
	field("education", "school", masterFields.education.shape.school),
	field("education", "degree", masterFields.education.shape.degree),
	field("education", "area", masterFields.education.shape.area),
	field("education", "grade", masterFields.education.shape.grade),
	field("education", "location", masterFields.education.shape.location),
	field("education", "dates", reviewedDatesSchema),
	field("education", "description", masterFields.education.shape.description),
	field("skills", "name", masterFields.skills.shape.name),
	field("skills", "proficiency", masterFields.skills.shape.proficiency),
	field("languages", "language", masterFields.languages.shape.language),
	field("languages", "fluency", masterFields.languages.shape.fluency),
	field("certifications", "title", masterFields.certifications.shape.title),
	field("certifications", "issuer", masterFields.certifications.shape.issuer),
	field("certifications", "dates", reviewedDatesSchema),
	field("certifications", "description", masterFields.certifications.shape.description),
]);
export type MasterFactInput = z.infer<typeof masterFactInputSchema>;

export const masterFactSchema = z.object({
	id: z.string().min(1),
	text: z.string(),
	source: careerSourceSchema,
	status: z.string(),
	structured: masterFactInputSchema.nullable(),
	proposedStructured: masterFactInputSchema.nullable(),
	confirmation: z.enum(["pending", "confirmed"]),
	revision: z.number().int().positive(),
	draftRevision: z.number().int().nonnegative(),
});
export type MasterFact = z.infer<typeof masterFactSchema>;

export const masterSectionOrderSchema = z.object({
	section: masterSectionSchema,
	entityIds: z.array(z.string().min(1)),
});
export type MasterSection = z.infer<typeof masterSectionOrderSchema>;
export const careerMasterSchema = z.object({
	profileRevision: z.number().int().nonnegative(),
	sections: z.array(masterSectionOrderSchema),
	facts: z.array(masterFactSchema),
	links: z
		.array(
			z.object({
				resumeId: z.string(),
				name: z.string(),
				factId: z.string(),
				acceptedRevision: z.number().int().positive(),
			}),
		)
		.default([]),
});
export type CareerMaster = z.infer<typeof careerMasterSchema>;

export const resumeFactLinkSchema = z.strictObject({
	resumeId: z.string().min(1),
	factId: z.string().min(1),
	acceptedRevision: z.number().int().positive(),
});
export type ResumeFactLink = z.infer<typeof resumeFactLinkSchema>;
