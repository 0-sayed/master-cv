import type { OwnerTransaction } from "@reactive-resume/db/client";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { VariantDecisionPayload } from "@reactive-resume/schema/resume/variants";
import type { CreateVariantInput } from "@reactive-resume/schema/resume/variants";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import {
	aiOperation,
	careerFact,
	resume,
	resumeFactLink,
	resumeJobSelection,
	resumeVariantSource,
} from "@reactive-resume/db/schema";
import {
	buildTranslationInventory,
	translationPlaceholders,
	translationStructureMatches,
	writeTranslationTarget,
} from "@reactive-resume/resume/translation";
import { createVariantInputSchema } from "@reactive-resume/schema/resume/variants";
import { readJobRevision } from "../career/job-targets";
import { lockDocumentOwner } from "../documents/ownership";
import { createResumeInTransaction } from "./service";

async function variantView(tx: OwnerTransaction, ownerId: string, resumeId: string) {
	const [cv] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, resumeId), isNull(resume.trashedAt)));
	const [provenance] = await tx
		.select()
		.from(resumeVariantSource)
		.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, resumeId)));
	if (!cv || !provenance) throw new ORPCError("NOT_FOUND");
	return {
		resumeId: cv.id,
		baseResumeId: cv.baseResumeId ?? cv.id,
		variantKind: cv.variantKind,
		sourceResumeId: provenance.sourceResumeId,
		sourceRevision: provenance.sourceRevision,
		documentLocale: cv.data.metadata.page.locale,
		targetLocale: provenance.targetLocale,
		reviewState: provenance.acceptedSourceRevision ? ("accepted" as const) : ("pending" as const),
		updatedAt: cv.updatedAt.toISOString(),
	};
}

export function createVariant(ownerId: string, raw: CreateVariantInput) {
	const input = createVariantInputSchema.parse(raw);
	const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
	return withOwnerDatabase(ownerId, async (tx) => {
		await lockDocumentOwner(tx, ownerId);
		const [replay] = await tx
			.select()
			.from(resumeVariantSource)
			.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.requestKey, input.requestKey)));
		if (replay) {
			if (replay.requestHash !== requestHash)
				throw new ORPCError("CONFLICT", { data: { reason: "REQUEST_KEY_REUSED" } });
			return variantView(tx, ownerId, replay.resumeId);
		}
		const [source] = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), eq(resume.id, input.sourceResumeId), isNull(resume.trashedAt)))
			.for("update");
		if (!source) throw new ORPCError("NOT_FOUND");
		if (source.isLocked) throw new ORPCError("RESUME_LOCKED", { status: 403 });
		if (source.updatedAt.toISOString() !== input.expectedUpdatedAt)
			throw new ORPCError("CONFLICT", { data: { reason: "RESUME_VERSION_CHANGED" } });
		if (input.variantKind === "language" && input.targetLocale === source.data.metadata.page.locale)
			throw new ORPCError("CONFLICT", { data: { reason: "LANGUAGE_ALREADY_CURRENT" } });
		if (input.variantKind === "job") await readJobRevision(tx, ownerId, input.jobId, input.jobRevision);
		const id = await createResumeInTransaction(tx, {
			userId: ownerId,
			name: source.name,
			tags: source.tags,
			data: structuredClone(source.data),
			locale: source.data.metadata.page.locale as "en-US" | "ar-SA",
			creation: { variantKind: input.variantKind, baseResumeId: source.id },
		});
		const links = await tx
			.select()
			.from(resumeFactLink)
			.where(and(eq(resumeFactLink.userId, ownerId), eq(resumeFactLink.resumeId, source.id)));
		if (links.length) await tx.insert(resumeFactLink).values(links.map((link) => ({ ...link, resumeId: id })));
		await tx.insert(resumeVariantSource).values({
			userId: ownerId,
			resumeId: id,
			sourceResumeId: source.id,
			sourceRevision: source.updatedAt.toISOString(),
			requestKey: input.requestKey,
			requestHash,
			targetLocale: input.variantKind === "language" ? input.targetLocale : null,
			jobId: input.variantKind === "job" ? input.jobId : null,
			jobRevision: input.variantKind === "job" ? input.jobRevision : null,
			acceptedFactRevisions: links.map((link) => ({ factId: link.factId, revision: link.acceptedRevision })),
		});
		if (input.variantKind === "job")
			await tx
				.insert(resumeJobSelection)
				.values({ userId: ownerId, resumeId: id, jobId: input.jobId, jobRevision: input.jobRevision });
		return variantView(tx, ownerId, id);
	});
}

export function getVariantFreshness(ownerId: string, resumeId: string) {
	return withOwnerDatabase(ownerId, async (tx) => {
		const variant = await variantView(tx, ownerId, resumeId);
		const [provenance] = await tx
			.select()
			.from(resumeVariantSource)
			.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, resumeId)));
		if (!provenance) throw new ORPCError("NOT_FOUND");
		const [source] = provenance.sourceResumeId
			? await tx
					.select()
					.from(resume)
					.where(and(eq(resume.userId, ownerId), eq(resume.id, provenance.sourceResumeId), isNull(resume.trashedAt)))
			: [];
		const facts = provenance.acceptedFactRevisions.length
			? await tx
					.select()
					.from(careerFact)
					.where(
						and(
							eq(careerFact.userId, ownerId),
							inArray(
								careerFact.id,
								provenance.acceptedFactRevisions.map((fact) => fact.factId),
							),
						),
					)
			: [];
		const staleFactIds = provenance.acceptedFactRevisions
			.filter(
				(accepted) =>
					!facts.some(
						(fact) => fact.id === accepted.factId && fact.revision === accepted.revision && fact.status !== "forgotten",
					),
			)
			.map((fact) => fact.factId);
		const sourceChanged = Boolean(
			source && source.updatedAt.toISOString() !== (provenance.acceptedSourceRevision ?? provenance.sourceRevision),
		);
		return {
			...variant,
			state: !source
				? ("unavailable" as const)
				: sourceChanged || staleFactIds.length
					? ("stale" as const)
					: ("current" as const),
			sourceChanged,
			staleFactIds,
		};
	});
}

/** One owner-scoped family; a language switch never changes the selected document. */
export function listVariants(ownerId: string, resumeId: string) {
	return withOwnerDatabase(ownerId, async (tx) => {
		const [selected] = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), eq(resume.id, resumeId), isNull(resume.trashedAt)));
		if (!selected) throw new ORPCError("NOT_FOUND");
		const baseId = selected.baseResumeId ?? selected.id;
		const family = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), isNull(resume.trashedAt), eq(resume.baseResumeId, baseId)));
		const [base] = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), eq(resume.id, baseId), isNull(resume.trashedAt)));
		return Promise.all(
			[...(base ? [base] : []), ...family].map(async (cv) => {
				const [provenance] = await tx
					.select()
					.from(resumeVariantSource)
					.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, cv.id)));
				const [operation] = await tx
					.select()
					.from(aiOperation)
					.where(
						and(
							eq(aiOperation.userId, ownerId),
							eq(aiOperation.kind, cv.variantKind === "language" ? "review.translation" : "review.tailoring"),
							sql`${aiOperation.sources} @> ${JSON.stringify([{ kind: "resume", id: cv.id }])}::jsonb`,
						),
					)
					.orderBy(desc(aiOperation.createdAt), desc(aiOperation.id))
					.limit(1);
				return {
					resumeId: cv.id,
					name: cv.name,
					variantKind: cv.variantKind,
					sourceResumeId: provenance?.sourceResumeId ?? null,
					documentLocale: cv.data.metadata.page.locale,
					targetLocale: provenance?.targetLocale ?? null,
					updatedAt: cv.updatedAt.toISOString(),
					operationId: operation?.id ?? null,
				};
			}),
		);
	});
}

/** Called only by the locked final decision transaction; never persists partially reviewed content. */
export async function applyReviewedTranslation(
	tx: OwnerTransaction,
	ownerId: string,
	input: {
		resumeId: string;
		sourceResumeId: string;
		expectedSourceRevision: string;
		data: ResumeData;
		payload: VariantDecisionPayload;
	},
) {
	const [source] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, input.sourceResumeId), isNull(resume.trashedAt)))
		.for("share");
	const [provenance] = await tx
		.select()
		.from(resumeVariantSource)
		.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, input.resumeId)))
		.for("update");
	if (
		!source ||
		source.isLocked ||
		source.updatedAt.toISOString() !== input.expectedSourceRevision ||
		provenance?.sourceResumeId !== source.id ||
		!provenance.targetLocale
	)
		throw new ORPCError("CONFLICT");
	if (!translationStructureMatches(source.data, input.data))
		throw new ORPCError("CONFLICT", { data: { reason: "TRANSLATION_STRUCTURE_CHANGED" } });
	const inventory = buildTranslationInventory(source.data);
	const placeholders = translationPlaceholders(source.data);
	if (
		inventory.blocking.length ||
		inventory.segments.length !== Object.keys(input.payload.segments).length ||
		input.payload.terms.terms.some((term) => term.status !== "confirmed")
	)
		throw new ORPCError("CONFLICT", { data: { reason: "TRANSLATION_REVIEW_INCOMPLETE" } });
	const data = structuredClone(input.data);
	for (const segment of inventory.segments) {
		const approved = input.payload.segments[segment.id];
		if (!approved || approved.status !== "accepted")
			throw new ORPCError("CONFLICT", { data: { reason: "TRANSLATION_REVIEW_INCOMPLETE" } });
		const term = input.payload.terms.terms.find((term) => term.id === `term:${segment.id}`);
		const text =
			term?.value ??
			placeholders.reduce(
				(text, entry) =>
					text.replaceAll(
						entry.token,
						() => input.payload.terms.terms.find((term) => term.source === entry.value)?.value ?? entry.value,
					),
				approved.text,
			);
		if (/\[(?:redacted|LOCAL_\d+)\]/iu.test(text))
			throw new ORPCError("CONFLICT", { data: { reason: "TRANSLATION_LOCAL_VALUE_UNRESOLVED" } });
		writeTranslationTarget(data, segment.target, text);
	}
	data.metadata.page.locale = provenance.targetLocale;
	return {
		data,
		provenance: {
			acceptedSourceRevision: source.updatedAt.toISOString(),
			terminology: input.payload.terms,
			acceptedFactRevisions: provenance.acceptedFactRevisions,
		},
	};
}
