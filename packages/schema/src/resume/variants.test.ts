import { expect, it } from "vite-plus/test";
import { createVariantInputSchema, translationTargetSchema, variantOperationKindSchema } from "./variants";

it("requires exactly the job or language parameters for an intentional copy", () => {
	const common = { sourceResumeId: "cv", expectedUpdatedAt: "2026-11-14T00:00:00.000Z", requestKey: "copy" };
	expect(
		createVariantInputSchema.safeParse({ ...common, variantKind: "language", targetLocale: "en-US" }).success,
	).toBe(true);
	expect(
		createVariantInputSchema.safeParse({ ...common, variantKind: "job", jobId: "j", jobRevision: "r" }).success,
	).toBe(true);
	for (const extra of [
		{ variantKind: "base" },
		{ variantKind: "language", targetLocale: "fr-FR" },
		{ variantKind: "job", jobId: "j" },
		{ variantKind: "language", targetLocale: "en-US", jobId: "j" },
		{ variantKind: "language", targetLocale: "en-US", userId: "bob" },
	])
		expect(createVariantInputSchema.safeParse({ ...common, ...extra }).success).toBe(false);
});

it("keeps translation targets closed to prose and excludes contacts, dates and arbitrary pointers", () => {
	expect(translationTargetSchema.safeParse({ sectionId: "summary", field: "content" }).success).toBe(true);
	expect(
		translationTargetSchema.safeParse({ sectionId: "experience", itemId: "job", roleId: "role", field: "description" })
			.success,
	).toBe(true);
	for (const target of [
		{ sectionId: "basics", field: "email" },
		{ sectionId: "experience", itemId: "job", field: "startDate" },
		{ sectionId: "metadata", field: "locale" },
		{ sectionId: "summary", field: "__proto__" },
		{ sectionId: "summary", field: "content", path: "/basics/email" },
		{ sectionId: "experience", itemId: "../email", field: "description" },
	])
		expect(translationTargetSchema.safeParse(target).success).toBe(false);
});

it("only accepts the four reviewed variant operations", () => {
	for (const operation of ["review.job-evidence", "review.tailoring", "review.translation", "review.summary"])
		expect(variantOperationKindSchema.safeParse(operation).success).toBe(true);
	expect(variantOperationKindSchema.safeParse("assistant").success).toBe(false);
});

it("addresses every supported visible translation field without widening contact or date access", () => {
	for (const target of [
		{ sectionId: "projects", itemId: "project", field: "name" },
		{ sectionId: "certifications", itemId: "certificate", field: "issuer" },
		{ sectionId: "education", field: "title" },
		{ sectionId: "languages", itemId: "language", field: "fluency" },
		{ sectionId: "skills", itemId: "skill", field: "keywords", index: 0 },
	])
		expect(translationTargetSchema.safeParse(target).success).toBe(true);
	for (const target of [
		{ sectionId: "skills", itemId: "skill", field: "name", index: 0 },
		{ sectionId: "projects", itemId: "project", field: "title" },
		{ sectionId: "education", itemId: "school", field: "location" },
	])
		expect(translationTargetSchema.safeParse(target).success).toBe(false);
});
