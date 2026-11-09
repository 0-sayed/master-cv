import type { CareerMaster, MasterFactInput } from "@reactive-resume/schema/career-master";
import { ORPCError } from "@orpc/server";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import * as t from "@reactive-resume/db/schema";
import { careerProfileDataSchema } from "@reactive-resume/schema/career";
import { careerMasterSchema, masterFactInputSchema, masterFactSchema } from "@reactive-resume/schema/career-master";
import { generateId } from "@reactive-resume/utils/string";

export async function ensureCareerProfile(userId: string) {
	await db
		.insert(t.careerProfile)
		.values({ userId, data: careerProfileDataSchema.parse({}) })
		.onConflictDoNothing();
}
async function lockProfile(userId: string, expected?: number) {
	await ensureCareerProfile(userId);
	const [profile] = await db.select().from(t.careerProfile).where(eq(t.careerProfile.userId, userId)).for("update");
	if (!profile) throw new ORPCError("NOT_FOUND");
	if (expected !== undefined && profile.profileRevision !== expected) throw new ORPCError("CONFLICT");
	return profile;
}
const owned = (userId: string, id: string) => and(eq(t.careerFact.userId, userId), eq(t.careerFact.id, id));
async function validateResumeRoot(userId: string, resume: typeof t.resume.$inferSelect) {
	if (resume.variantKind === "base" && resume.baseResumeId === null) return;
	const [root] = await db
		.select()
		.from(t.resume)
		.where(
			and(eq(t.resume.userId, userId), eq(t.resume.id, resume.baseResumeId ?? ""), sql`${t.resume.trashedAt} IS NULL`),
		);
	if (!root || root.id === resume.id || root.variantKind !== "base" || root.baseResumeId !== null)
		throw new ORPCError("PRECONDITION_FAILED");
}
function read(userId: string): Promise<CareerMaster> {
	return withOwnerDatabase(userId, async () => {
		await ensureCareerProfile(userId);
		const [profile] = await db.select().from(t.careerProfile).where(eq(t.careerProfile.userId, userId));
		const facts = await db
			.select()
			.from(t.careerFact)
			.where(and(eq(t.careerFact.userId, userId), ne(t.careerFact.status, "forgotten")));
		const links = await db
			.select({
				resumeId: t.resume.id,
				name: t.resume.name,
				factId: t.resumeFactLink.factId,
				acceptedRevision: t.resumeFactLink.acceptedRevision,
			})
			.from(t.resumeFactLink)
			.innerJoin(t.resume, eq(t.resumeFactLink.resumeId, t.resume.id))
			.where(and(eq(t.resumeFactLink.userId, userId), eq(t.resume.userId, userId), sql`${t.resume.trashedAt} IS NULL`));
		return careerMasterSchema.parse({
			profileRevision: profile?.profileRevision ?? 0,
			sections: profile?.sectionOrder ?? [],
			facts: facts.filter((fact) => fact.structured || fact.proposedStructured),
			links,
		});
	});
}
type Version = { id: string; expectedRevision: number; expectedDraftRevision: number };
export const careerMasterService = {
	read,
	savePending: (userId: string, input: MasterFactInput & Partial<Version>) =>
		withOwnerDatabase(userId, async () => {
			await lockProfile(userId);
			const { id, expectedRevision, expectedDraftRevision, ...value } = input;
			const proposed = masterFactInputSchema.parse(value);
			// T003 manual forms cannot fabricate extracted provenance. T004 owns validated extraction.
			if (proposed.source.kind !== "manual") throw new ORPCError("BAD_REQUEST");
			const requiredField = {
				experience: "company",
				education: "school",
				skills: "name",
				languages: "language",
				certifications: "title",
			}[proposed.section];
			if (proposed.field === requiredField && typeof proposed.value === "string" && !proposed.value.trim())
				throw new ORPCError("BAD_REQUEST");
			if (id) {
				const [row] = await db.select().from(t.careerFact).where(owned(userId, id));
				if (!row || row.status === "forgotten") throw new ORPCError("NOT_FOUND");
				if (row.revision !== expectedRevision || row.draftRevision !== expectedDraftRevision)
					throw new ORPCError("CONFLICT");
				const previous = row.proposedStructured ?? row.structured;
				if (
					!previous ||
					previous.entityId !== proposed.entityId ||
					previous.section !== proposed.section ||
					previous.field !== proposed.field
				)
					throw new ORPCError("BAD_REQUEST");
				const [saved] = await db
					.update(t.careerFact)
					.set({ proposedStructured: proposed, draftRevision: row.draftRevision + 1 })
					.where(owned(userId, id))
					.returning();
				return masterFactSchema.parse(saved);
			}
			const existing = await db
				.select()
				.from(t.careerFact)
				.where(and(eq(t.careerFact.userId, userId), ne(t.careerFact.status, "forgotten")));
			if (
				existing.some((row) => {
					const entry = row.proposedStructured ?? row.structured;
					return (
						entry?.entityId === proposed.entityId &&
						(entry.section !== proposed.section || entry.field === proposed.field)
					);
				})
			)
				throw new ORPCError("CONFLICT");
			const [saved] = await db
				.insert(t.careerFact)
				.values({
					userId,
					text: "",
					category: (
						{
							experience: "experience",
							education: "experience",
							skills: "skill",
							languages: "skill",
							certifications: "accomplishment",
						} as const
					)[proposed.section],
					source: proposed.source,
					sourceKey: `master:${generateId()}`,
					proposedStructured: proposed,
					draftRevision: 1,
				})
				.returning();
			return masterFactSchema.parse(saved);
		}),
	confirm: (userId: string, input: { facts: Version[]; expectedProfileRevision: number }) =>
		withOwnerDatabase(userId, async () => {
			if (!input.facts.length || new Set(input.facts.map((fact) => fact.id)).size !== input.facts.length)
				throw new ORPCError("BAD_REQUEST");
			const profile = await lockProfile(userId, input.expectedProfileRevision);
			const rows = await db
				.select()
				.from(t.careerFact)
				.where(
					and(
						eq(t.careerFact.userId, userId),
						inArray(
							t.careerFact.id,
							input.facts.map((fact) => fact.id),
						),
					),
				);
			if (rows.length !== input.facts.length || rows.some((row) => row.status === "forgotten"))
				throw new ORPCError("NOT_FOUND");
			const first = rows[0]?.proposedStructured;
			if (!first) throw new ORPCError("CONFLICT");
			for (const row of rows) {
				const expected = input.facts.find((fact) => fact.id === row.id);
				if (
					!row.proposedStructured ||
					row.revision !== expected?.expectedRevision ||
					row.draftRevision !== expected.expectedDraftRevision
				)
					throw new ORPCError("CONFLICT");
				if (row.proposedStructured.entityId !== first.entityId || row.proposedStructured.section !== first.section)
					throw new ORPCError("BAD_REQUEST");
			}
			for (const row of rows) {
				const structured = masterFactInputSchema.parse(row.proposedStructured);
				const revision = row.structured ? row.revision + 1 : row.revision;
				await db.insert(t.careerFactRevision).values({ userId, factId: row.id, revision, structured });
				await db
					.update(t.careerFact)
					.set({
						structured,
						source: structured.source,
						proposedStructured: null,
						confirmation: "confirmed",
						revision,
						text: typeof structured.value === "string" ? structured.value : JSON.stringify(structured.value),
					})
					.where(owned(userId, row.id));
			}
			const sections = structuredClone(profile.sectionOrder);
			let section = sections.find((section) => section.section === first.section);
			if (!section) {
				section = { section: first.section, entityIds: [] };
				sections.push(section);
			}
			if (!section.entityIds.includes(first.entityId)) section.entityIds.push(first.entityId);
			await db
				.update(t.careerProfile)
				.set({ profileRevision: profile.profileRevision + 1, sectionOrder: sections })
				.where(eq(t.careerProfile.userId, userId));
			return read(userId);
		}),
	remove: (userId: string, input: { entityId: string; expectedProfileRevision: number }) =>
		withOwnerDatabase(userId, async () => {
			const profile = await lockProfile(userId, input.expectedProfileRevision);
			const rows = await db
				.select()
				.from(t.careerFact)
				.where(and(eq(t.careerFact.userId, userId), ne(t.careerFact.status, "forgotten")));
			const entry = rows.filter((row) => (row.structured ?? row.proposedStructured)?.entityId === input.entityId);
			if (!entry.length) throw new ORPCError("NOT_FOUND");
			for (const row of entry) {
				if (row.structured)
					await db
						.insert(t.careerFactRevision)
						.values({ userId, factId: row.id, revision: row.revision + 1, structured: row.structured, removed: true });
				await db
					.update(t.careerFact)
					.set({
						status: "forgotten",
						proposedStructured: null,
						revision: row.structured ? row.revision + 1 : row.revision,
					})
					.where(owned(userId, row.id));
			}
			await db
				.update(t.careerProfile)
				.set({
					profileRevision: profile.profileRevision + 1,
					sectionOrder: profile.sectionOrder.map((section) => ({
						...section,
						entityIds: section.entityIds.filter((id) => id !== input.entityId),
					})),
				})
				.where(eq(t.careerProfile.userId, userId));
			return read(userId);
		}),
	linkResumeFacts: (
		userId: string,
		input: { resumeId: string; links: Array<{ factId: string; acceptedRevision: number }> },
	) =>
		withOwnerDatabase(userId, async () => {
			await lockProfile(userId);
			const [resume] = await db
				.select()
				.from(t.resume)
				.where(and(eq(t.resume.userId, userId), eq(t.resume.id, input.resumeId), sql`${t.resume.trashedAt} IS NULL`))
				.for("update");
			if (!resume) throw new ORPCError("NOT_FOUND");
			await validateResumeRoot(userId, resume);
			if (new Set(input.links.map((link) => link.factId)).size !== input.links.length)
				throw new ORPCError("BAD_REQUEST");
			for (const link of input.links) {
				const [fact] = await db.select().from(t.careerFact).where(owned(userId, link.factId));
				if (!fact || !fact.structured) throw new ORPCError("NOT_FOUND");
				const [snapshot] = await db
					.select()
					.from(t.careerFactRevision)
					.where(
						and(
							eq(t.careerFactRevision.userId, userId),
							eq(t.careerFactRevision.factId, link.factId),
							eq(t.careerFactRevision.revision, link.acceptedRevision),
							eq(t.careerFactRevision.removed, false),
						),
					);
				if (!snapshot) throw new ORPCError("NOT_FOUND");
			}
			await db
				.delete(t.resumeFactLink)
				.where(and(eq(t.resumeFactLink.userId, userId), eq(t.resumeFactLink.resumeId, input.resumeId)));
			if (input.links.length)
				await db
					.insert(t.resumeFactLink)
					.values(input.links.map((link) => ({ ...link, userId, resumeId: input.resumeId })));
		}),
	resumeLinkState: (userId: string, resumeId: string) =>
		withOwnerDatabase(userId, async () => {
			const [resume] = await db
				.select()
				.from(t.resume)
				.where(and(eq(t.resume.id, resumeId), eq(t.resume.userId, userId)));
			if (!resume) throw new ORPCError("NOT_FOUND");
			await validateResumeRoot(userId, resume);
			const links = await db
				.select()
				.from(t.resumeFactLink)
				.innerJoin(t.careerFact, eq(t.resumeFactLink.factId, t.careerFact.id))
				.where(and(eq(t.resumeFactLink.userId, userId), eq(t.resumeFactLink.resumeId, resumeId)));
			return {
				baseResumeId: resume.baseResumeId ?? resume.id,
				variantKind: resume.variantKind,
				staleFactIds: links
					.filter(
						({ resume_fact_link: link, career_fact: fact }) =>
							link.acceptedRevision !== fact.revision || fact.status === "forgotten",
					)
					.map(({ career_fact: fact }) => fact.id),
			};
		}),
};
