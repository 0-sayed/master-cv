import type { VariantSnapshot } from "./variant-types";
import type { OwnerTransaction } from "@reactive-resume/db/client";
import type { OperationRequest, SourceRevision } from "@reactive-resume/schema/ai-operation";
import type { VariantOperationKind } from "@reactive-resume/schema/resume/variants";
import { ORPCError } from "@orpc/client";
import { and, eq, isNull } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import {
	resume,
	resumeFactLink,
	careerFact,
	resumeJobSelection,
	resumeVariantSource,
} from "@reactive-resume/db/schema";
import { buildJobPassages } from "@reactive-resume/resume/ats";
import { readTarget } from "@reactive-resume/resume/proposals";
import { buildTranslationInventory, translationPlaceholders } from "@reactive-resume/resume/translation";
import { reviewTargetSchema } from "@reactive-resume/schema/resume/ai-review";
import { readJobRevision } from "../career/job-targets";
import { lockDocumentOwner } from "../documents/ownership";
import { buildModelPayload, resumeContactValues } from "./payload";
import { lockReviewProfile } from "./review-sources";
import { variantOperationContracts } from "./variant-contracts";

function conflict(): never {
	throw new ORPCError("CONFLICT", { data: { reason: "AI_SOURCE_CHANGED" } });
}
export async function loadVariantSnapshot(
	tx: OwnerTransaction,
	ownerId: string,
	request: Pick<OperationRequest, "kind" | "parameters" | "sources">,
): Promise<VariantSnapshot> {
	const kind = request.kind as VariantOperationKind;
	if (!Object.hasOwn(variantOperationContracts, kind)) throw new ORPCError("BAD_REQUEST");
	const contract = variantOperationContracts[kind];
	const parameters = contract.parameters.parse(request.parameters);
	await lockDocumentOwner(tx, ownerId);
	await lockReviewProfile(tx, ownerId);
	const [cv] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, parameters.resumeId), isNull(resume.trashedAt)))
		.for("share");
	if (!cv) throw new ORPCError("NOT_FOUND");
	if (cv.isLocked) throw new ORPCError("RESUME_LOCKED", { status: 403 });
	if (cv.updatedAt.toISOString() !== parameters.expectedUpdatedAt) conflict();
	const expected: SourceRevision[] = [{ kind: "resume", id: cv.id, revision: cv.updatedAt.toISOString() }];
	const passages = buildJobPassages(cv.data);
	const contactValues = resumeContactValues(cv.data);
	const clean = (text: string) => {
		const named = cv.data.basics.name ? text.replaceAll(cv.data.basics.name, "[NAME_1]") : text;
		return (
			buildModelPayload({
				selections: [{ id: "selected", kind: "confirmed_content", section: "summary", text: named }],
				contactValues,
			}).selections[0]?.text ?? ""
		);
	};
	const snapshot: VariantSnapshot = {
		category: contract.category,
		resumeId: cv.id,
		sourceRevision: parameters.expectedUpdatedAt,
		cv: passages.map((passage) => ({ id: passage.id, section: passage.target.sectionId, text: clean(passage.text) })),
		jobAd: null,
	};
	const [provenance] = await tx
		.select()
		.from(resumeVariantSource)
		.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, cv.id)));
	let translationSource: typeof resume.$inferSelect | undefined;
	if (kind === "review.tailoring" || kind === "review.translation") {
		if (!provenance?.sourceResumeId || cv.variantKind !== (kind === "review.translation" ? "language" : "job"))
			conflict();
		const [source] = await tx
			.select()
			.from(resume)
			.where(and(eq(resume.userId, ownerId), eq(resume.id, provenance.sourceResumeId), isNull(resume.trashedAt)))
			.for("share");
		if (!source) throw new ORPCError("NOT_FOUND");
		const expectedSource =
			kind === "review.translation"
				? variantOperationContracts[kind].parameters.parse(request.parameters).expectedSourceRevision
				: (provenance.acceptedSourceRevision ?? provenance.sourceRevision);
		if (source.isLocked || source.updatedAt.toISOString() !== expectedSource) conflict();
		expected.push({ kind: "resume", id: source.id, revision: source.updatedAt.toISOString() });
		if (kind === "review.translation") translationSource = source;
	}
	const links = await tx
		.select()
		.from(resumeFactLink)
		.innerJoin(careerFact, and(eq(resumeFactLink.factId, careerFact.id), eq(resumeFactLink.userId, careerFact.userId)))
		.where(and(eq(resumeFactLink.userId, ownerId), eq(resumeFactLink.resumeId, cv.id)));
	if (
		links.some(
			({ resume_fact_link: link, career_fact: fact }) =>
				link.acceptedRevision !== fact.revision || fact.status === "forgotten",
		)
	)
		conflict();
	if (kind === "review.job-evidence" || kind === "review.tailoring") {
		const jobParameters = variantOperationContracts[kind].parameters.parse(request.parameters);
		const [selection] = await tx
			.select()
			.from(resumeJobSelection)
			.where(and(eq(resumeJobSelection.userId, ownerId), eq(resumeJobSelection.resumeId, cv.id)))
			.for("share");
		if (
			!selection ||
			selection.jobId !== jobParameters.jobId ||
			selection.jobRevision !== jobParameters.jobRevision ||
			selection.updatedAt.toISOString() !== jobParameters.expectedSelectionRevision
		)
			conflict();
		const job = await readJobRevision(tx, ownerId, jobParameters.jobId, jobParameters.jobRevision);
		expected.push({ kind: "job", id: job.jobId, revision: job.revision });
		// One exact span avoids truncating or silently dropping any part of a pasted advert.
		snapshot.jobAd = { segments: [{ id: `job:${job.jobId}:${job.revision}`, text: clean(job.text) }] };
	}
	if (kind === "review.summary") {
		const summaryParameters = variantOperationContracts[kind].parameters.parse(request.parameters);
		if (summaryParameters.selectedEvidenceIds.some((id) => !snapshot.cv.some((fact) => fact.id === id))) conflict();
		snapshot.cv = snapshot.cv.filter((fact) => summaryParameters.selectedEvidenceIds.includes(fact.id));
	}
	if (kind === "review.tailoring") {
		snapshot.variant = {
			resumeId: cv.id,
			baseRevision: snapshot.sourceRevision,
			fields: passages
				.filter((passage) => reviewTargetSchema.safeParse(passage.target).success)
				.map((passage) => ({
					...passage.target,
					itemId: passage.target.itemId ?? null,
					roleId: passage.target.roleId ?? null,
					text: clean(readTarget(cv.data, passage.target) ?? ""),
					evidenceIds: [passage.id],
				})),
			order: Object.entries(cv.data.sections).map(([sectionId, section]) => ({
				sectionId,
				itemIds: section.items.map((item) => item.id),
			})),
		};
	}
	if (kind === "review.translation") {
		if (
			!provenance?.targetLocale ||
			!translationSource ||
			provenance.targetLocale === translationSource.data.metadata.page.locale
		)
			conflict();
		const inventory = buildTranslationInventory(translationSource.data);
		if (inventory.blocking.length)
			throw new ORPCError("PRECONDITION_FAILED", { data: { reason: "TRANSLATION_PARTIAL_COVERAGE" } });
		const placeholders = translationPlaceholders(translationSource.data);
		snapshot.cv = inventory.segments.map((segment) => {
			const protectedText = placeholders.reduce(
				(text, entry) => text.replaceAll(entry.value, entry.token),
				segment.text,
			);
			return { id: segment.id, section: segment.target.sectionId, text: clean(protectedText) };
		});
		snapshot.direction = provenance.targetLocale === "en-US" ? "ar-en" : "en-ar";
	}
	if (snapshot.cv.length > 49 || snapshot.cv.some((fact) => fact.text.length > 4000))
		throw new ORPCError("PRECONDITION_FAILED", { data: { reason: "AI_INPUT_LIMIT" } });
	if (
		request.sources.length !== expected.length ||
		expected.some(
			(source) =>
				!request.sources.some(
					(actual) => actual.kind === source.kind && actual.id === source.id && actual.revision === source.revision,
				),
		)
	)
		conflict();
	return snapshot;
}

export function prepareVariantReview(ownerId: string, input: { kind: VariantOperationKind } & Record<string, unknown>) {
	return withOwnerDatabase(ownerId, async (tx) => {
		const { kind, ...raw } = input;
		if (!Object.hasOwn(variantOperationContracts, kind)) throw new ORPCError("BAD_REQUEST");
		const parameters = variantOperationContracts[kind].parameters.parse(raw);
		const sources: SourceRevision[] = [
			{ kind: "resume", id: parameters.resumeId, revision: parameters.expectedUpdatedAt },
		];
		if (kind === "review.job-evidence" || kind === "review.tailoring") {
			const jobParameters = variantOperationContracts[kind].parameters.parse(raw);
			sources.push({ kind: "job", id: jobParameters.jobId, revision: jobParameters.jobRevision });
		}
		if (kind === "review.tailoring" || kind === "review.translation") {
			const [provenance] = await tx
				.select()
				.from(resumeVariantSource)
				.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, parameters.resumeId)));
			if (!provenance?.sourceResumeId) throw new ORPCError("NOT_FOUND");
			const sourceRevision =
				kind === "review.translation"
					? variantOperationContracts[kind].parameters.parse(raw).expectedSourceRevision
					: (provenance.acceptedSourceRevision ?? provenance.sourceRevision);
			sources.push({ kind: "resume", id: provenance.sourceResumeId, revision: sourceRevision });
		}
		const snapshot = await loadVariantSnapshot(tx, ownerId, { kind, parameters, sources });
		return {
			kind,
			parameters,
			sources,
			evidenceIds: snapshot.cv.map((fact) => fact.id),
			contractVersion: variantOperationContracts[kind].schemaVersion,
		};
	});
}
