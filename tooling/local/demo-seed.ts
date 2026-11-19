import type { SeedOnlyResumeAdmission } from "@reactive-resume/api/features/documents/service";
import { readFile } from "node:fs/promises";
import { demoApplicationNotes } from "./demo-career";
import { createDemoFixture, demoCredentials } from "./demo-fixture";
import { demoRequired } from "./demo-resume";
import { assertDemoEnvironment } from "./demo-safety";

const demoAvatarPath = new URL("./fixtures/demo-avatar.png", import.meta.url);
const completionTag = "Career portfolio · November 2026 · Calendar";
let ownedPool: { end(): Promise<void> } | undefined;

export function inspectDemoState(resumes: Array<{ tags: string[] }>, counts: number[]) {
	if (resumes.some((resume) => resume.tags.includes(completionTag))) return "complete";
	if (
		resumes.some((resume) =>
			resume.tags.some((tag) =>
				[
					"Sirawise local demo v1",
					"Sirawise local demo v2",
					"Career portfolio 2026",
					"Career portfolio · November 2026",
					"Career portfolio · November 2026 · 2",
					"Career portfolio · November 2026 · Insights",
					"Career portfolio · November 2026 · Showcase",
				].includes(tag),
			),
		)
	)
		throw new Error("DEMO_VERSION_REQUIRES_RESET");
	if (resumes.length || counts.some((count) => count > 0)) throw new Error("DEMO_PARTIAL_CONTENT");
	return "empty";
}

/** This callback never enters RPC input or the app server's configuration. */
export async function createDemoJobCopyAdmission(
	user: { id: string; email: string },
	environment: NodeJS.ProcessEnv,
): Promise<SeedOnlyResumeAdmission> {
	await assertDemoEnvironment(environment);
	if (user.email !== demoCredentials.email) throw new Error("DEMO_IDENTITY_COLLISION");
	const ownerId = user.id;
	const { resume } = await import("@reactive-resume/db/schema");
	const { and, count, eq } = await import("drizzle-orm");
	return async (tx, requestedOwner, creation, reservationOperationId) => {
		if (requestedOwner !== ownerId || creation.variantKind !== "job" || reservationOperationId)
			throw new Error("DEMO_JOB_COPY_SCOPE_REQUIRED");
		const [row] = await tx
			.select({ value: count() })
			.from(resume)
			.where(
				and(eq(resume.userId, ownerId), eq(resume.baseResumeId, creation.baseResumeId), eq(resume.variantKind, "job")),
			);
		if (Number(row?.value ?? 0) >= 13) throw new Error("DEMO_JOB_COPY_LIMIT");
	};
}

export async function closeDemoDatabase() {
	await ownedPool?.end();
	ownedPool = undefined;
}

export async function seedDemoWorkspace(options: { reset?: boolean; now?: Date } = {}) {
	const { appUrl } = await assertDemoEnvironment(process.env);
	const now = options.now ?? new Date();
	const demoFixture = createDemoFixture(now);
	const hadPool = Boolean((globalThis as typeof globalThis & { __pool?: unknown }).__pool);
	const { getPool, withOwnerDatabase } = await import("@reactive-resume/db/client");
	if (!hadPool) ownedPool = getPool();
	const { assertRuntimeDatabaseRole } = await import("@reactive-resume/db/owner-scope");
	await assertRuntimeDatabaseRole(getPool());
	const { initializeAuth } = await import("@reactive-resume/auth/config");
	await initializeAuth();
	const { ensureDemoAccount, createDemoClient } = await import("./demo-account");
	const { careerService } = await import("@reactive-resume/api/features/career/service");
	const { documentsService } = await import("@reactive-resume/api/features/documents/service");
	const { applicationService } = await import("@reactive-resume/api/features/applications/service");
	const { lockActiveAccount } = await import("@reactive-resume/db/account-state");
	const tables = await import("@reactive-resume/db/schema");
	const { count, eq } = await import("drizzle-orm");
	const { user } = await ensureDemoAccount();
	if (options.reset) {
		const { auth } = await import("@reactive-resume/auth/config");
		const authContext = await auth.$context;
		await authContext.internalAdapter.deleteUserSessions(user.id);
	}
	const client = createDemoClient(user, appUrl);
	const seedOnlyAdmission = await createDemoJobCopyAdmission(user, process.env);
	const oldPictureKeys: string[] = [];
	let uploadedKey: string | undefined;
	let committed = false;
	try {
		const result = await withOwnerDatabase(user.id, async (tx) => {
			await lockActiveAccount(tx, user.id);
			const existing = await client.resume.list({});
			const counts: number[] = [];
			for (const table of [
				tables.coverLetter,
				tables.application,
				tables.careerProfile,
				tables.careerFact,
				tables.careerStory,
				tables.jobTarget,
				tables.careerWorkspace,
				tables.careerArtifact,
			]) {
				const [row] = await tx.select({ value: count() }).from(table);
				counts.push(Number(row?.value ?? 0));
			}
			const readback = async (status: "created" | "skipped") => ({
				status,
				userId: user.id,
				resumes: (await client.resume.list({})).length,
				letters: (await client.coverLetters.list({})).items.length,
				applications: (await client.applications.list({})).length,
				trash: (await client.documents.list({ trashed: true })).length,
			});
			if (!options.reset && inspectDemoState(existing, counts) === "complete") return readback("skipped");
			if (options.reset) {
				const pictures = await tx
					.select({ key: tables.storedFile.key })
					.from(tables.storedFile)
					.where(eq(tables.storedFile.userId, user.id));
				oldPictureKeys.push(...pictures.map((picture) => picture.key));
				for (const table of [
					tables.careerArtifact,
					tables.careerWorkspace,
					tables.careerTranscript,
					tables.careerStory,
					tables.application,
					tables.coverLetter,
					tables.resumeVariantSource,
					tables.resume,
					tables.jobTarget,
					tables.careerFact,
					tables.careerProfile,
				]) {
					await tx.delete(table).where(eq(table.userId, user.id));
				}
			}
			const avatar = await client.storage.uploadFile(
				new File([await readFile(demoAvatarPath)], "demo-avatar.png", { type: "image/png" }),
			);
			uploadedKey = avatar.path;
			await careerService.saveProfile(user.id, demoFixture.profile);
			const factIds: string[] = [];
			for (const fact of demoFixture.facts) {
				const saved = await careerService.saveFact(user.id, fact);
				if (!saved) throw new Error("DEMO_FACT_COLLISION");
				factIds.push(saved.id);
			}
			for (const [index, story] of demoFixture.stories.entries()) {
				await careerService.saveStory(user.id, { ...story, factIds: factIds.slice(index * 2, index * 2 + 2) });
			}
			const groups = Map.groupBy(demoFixture.masterFacts, (fact) => `${fact.section}:${fact.entityId}`);
			let master = await client.career.master.read({});
			for (const facts of groups.values()) {
				const pending = [];
				for (const fact of facts) pending.push(await client.career.master.savePending({ fact }));
				master = await client.career.master.confirm({
					expectedProfileRevision: master.profileRevision,
					facts: pending.map((fact) => ({
						id: fact.id,
						expectedRevision: fact.revision,
						expectedDraftRevision: fact.draftRevision,
					})),
				});
			}
			const baseId = await client.resume.create({
				name: "السيرة الأساسية",
				tags: [],
				locale: "ar-SA",
				empty: true,
				withSampleData: false,
			});
			const updateResume = async (id: string, index: number) => {
				const current = await client.resume.getById({ id });
				const fixture = demoFixture.resumes[index];
				const data = fixture && structuredClone(fixture);
				if (data) data.picture.url = avatar.url;
				if (!data) throw new Error("DEMO_RESUME_MISSING");
				await client.resume.update({ id, data, expectedUpdatedAt: current.updatedAt });
			};
			const deletedAt = now.getTime();
			// The internal clock permits recent historical dates without exposing backdating in the public procedure.
			for (const [index, name] of ["خطاب مدير العمليات", "Service improvement cover letter"].entries()) {
				const content = structuredClone(demoRequired(demoFixture.letters[index]));
				content.style.picture.url = avatar.url;
				const letter = await client.coverLetters.create({ ...content, name });
				await documentsService.trash(
					{ userId: user.id, type: "letter", id: letter.id },
					new Date(deletedAt - (index + 1) * 86400000),
				);
			}
			await updateResume(baseId, 0);
			await client.career.master.linkResumeFacts({
				resumeId: baseId,
				links: master.facts.map((fact) => ({ factId: fact.id, acceptedRevision: fact.revision })),
			});
			const applicationIds: string[] = [];
			for (const scenario of demoFixture.applicationScenarios)
				applicationIds.push(
					await applicationService.create(
						{
							userId: user.id,
							...scenario.input,
							status: "saved",
							closedReason: null,
							stageEnteredAt: demoRequired(scenario.history[0]).at.toISOString().slice(0, 10),
						},
						{ stageAt: demoRequired(scenario.history[0]).at },
					),
				);
			const jobs = [];
			for (const job of demoFixture.jobs) jobs.push(await client.career.jobTargets.save(job));
			const base = await client.resume.getById({ id: baseId });
			const english = await client.resume.variants.create({
				sourceResumeId: baseId,
				expectedUpdatedAt: base.updatedAt.toISOString(),
				requestKey: "sirawise-demo-english-insights",
				variantKind: "language",
				targetLocale: "en-US",
			});
			await updateResume(english.resumeId, 1);
			const englishResume = await client.resume.getById({ id: english.resumeId });
			const job = jobs[0];
			if (!job) throw new Error("DEMO_JOB_MISSING");
			const tailored = await client.resume.variants.create({
				sourceResumeId: english.resumeId,
				expectedUpdatedAt: englishResume.updatedAt.toISOString(),
				requestKey: "sirawise-demo-tailored-insights",
				variantKind: "job",
				jobId: job.jobId,
				jobRevision: job.revision,
			});
			await updateResume(tailored.resumeId, 2);
			const resumeIds = [baseId, english.resumeId, tailored.resumeId];
			const letters = [];
			for (const [index, letter] of demoFixture.letters.entries()) {
				const resumeId = resumeIds[index % 2 === 0 ? 0 : index === 3 ? 2 : 1];
				const applicationId = applicationIds[index];
				const content = structuredClone(letter);
				content.style.picture.url = avatar.url;
				letters.push(await client.coverLetters.create({ ...content, resumeId, applicationId }));
			}
			let tailoredCount = 0;
			for (const [index, id] of applicationIds.entries()) {
				const scenario = demoRequired(demoFixture.applicationScenarios[index]);
				let resumeId: string | undefined;
				if (scenario.resumeGroup === "tailored") {
					resumeId =
						tailoredCount++ === 0
							? tailored.resumeId
							: await documentsService.copyForJob(
									{
										userId: user.id,
										resumeId: english.resumeId,
										applicationId: id,
									},
									{ seedOnlyAdmission },
								);
					await client.documents.linkApplication({ type: "resume", id: resumeId, applicationId: id });
				} else if (scenario.resumeGroup === "base") {
					resumeId = index % 2 ? english.resumeId : baseId;
					const current = await client.applications.getById({ id });
					await client.applications.update({ id, expectedUpdatedAt: current.updatedAt.toISOString(), resumeId });
				}
				if (letters[index]) {
					const current = await client.applications.getById({ id });
					await client.applications.update({
						id,
						expectedUpdatedAt: current.updatedAt.toISOString(),
						coverLetterId: letters[index]?.id,
					});
				}
				for (const event of scenario.history.slice(1)) {
					const current = await client.applications.getById({ id });
					await applicationService.update(
						{
							userId: user.id,
							id,
							expectedUpdatedAt: current.updatedAt.toISOString(),
							status: event.stage,
							stageEnteredAt: event.at.toISOString().slice(0, 10),
							closedReason: event.stage === "closed" ? scenario.input.closedReason : null,
						},
						{ stageAt: event.at },
					);
				}
				for (const note of demoApplicationNotes(index, now)) await client.applications.addNote({ id, ...note });
				for (const interview of scenario.interviews)
					await client.applications.addInterview({ id, ...interview, at: interview.at.toISOString() });
				const workspace = await careerService.workspace(user.id, id);
				await careerService.saveWorkspace(
					user.id,
					id,
					{
						questions: [{ text: "How does your team measure a useful handover?", origin: "manual" }],
						answers: [
							{
								id: "demo-answer",
								question: "Describe a reporting improvement.",
								answer: demoRequired(demoFixture.facts[0]).text,
								factIds: factIds.slice(0, 2),
							},
						],
					},
					{ questions: workspace.questions, answers: workspace.answers },
				);
			}
			for (const showcase of demoFixture.showcaseResumes) {
				const id = await documentsService.copyForJob(
					{ userId: user.id, resumeId: english.resumeId, name: showcase.name },
					{ seedOnlyAdmission },
				);
				const current = await client.resume.getById({ id });
				await client.resume.update({
					id,
					data: structuredClone(showcase.data),
					expectedUpdatedAt: current.updatedAt,
				});
			}
			await client.career.personalWorkspace.completeWelcome({});
			const result = await readback("created");
			if (
				result.resumes !== 15 ||
				result.letters !== 11 ||
				result.applications !== 20 ||
				result.trash !== 2 ||
				(await careerService.stories({ userId: user.id, applicationId: null })).length !== 8
			)
				throw new Error(
					`DEMO_READBACK_FAILED:${JSON.stringify(result)}:stories=${(await careerService.stories({ userId: user.id, applicationId: null })).length}`,
				);
			const finalBase = await client.resume.getById({ id: baseId });
			await client.resume.update({
				id: baseId,
				tags: [...finalBase.tags, completionTag],
				expectedUpdatedAt: finalBase.updatedAt,
			});
			return result;
		});
		committed = true;
		for (const key of oldPictureKeys) await client.storage.deleteFile({ filename: key });
		return result;
	} catch (error) {
		if (uploadedKey && !committed) {
			const { getStorageService } = await import("@reactive-resume/api/features/storage");
			if (!uploadedKey.startsWith(`uploads/${user.id}/`)) throw new Error("DEMO_STORAGE_OWNER_MISMATCH");
			await getStorageService().delete(uploadedKey);
		}
		throw error;
	}
}
