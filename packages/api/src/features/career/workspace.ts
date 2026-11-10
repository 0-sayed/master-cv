import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import * as t from "@reactive-resume/db/schema";
import { ensureCareerProfile } from "./master";

export const workspaceService = {
	state: (userId: string) =>
		withOwnerDatabase(userId, async () => {
			await ensureCareerProfile(userId);
			const [profile] = await db.select().from(t.careerProfile).where(eq(t.careerProfile.userId, userId));
			const resumes = await db
				.select({ id: t.resume.id })
				.from(t.resume)
				.where(and(eq(t.resume.userId, userId), isNull(t.resume.trashedAt)))
				.limit(1);
			const letters = await db
				.select({ id: t.coverLetter.id })
				.from(t.coverLetter)
				.where(and(eq(t.coverLetter.userId, userId), isNull(t.coverLetter.trashedAt)))
				.limit(1);
			return {
				welcomeCompletedAt: profile?.welcomeCompletedAt ?? null,
				hasDocuments: Boolean(resumes.length || letters.length),
			};
		}),
	completeWelcome: (userId: string) =>
		withOwnerDatabase(userId, async () => {
			await ensureCareerProfile(userId);
			await db
				.update(t.careerProfile)
				.set({ welcomeCompletedAt: sql`COALESCE(${t.careerProfile.welcomeCompletedAt},now())` })
				.where(eq(t.careerProfile.userId, userId));
		}),
};
