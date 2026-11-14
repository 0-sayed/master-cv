import type { OwnerTransaction } from "@reactive-resume/db/client";
import type {
	VariantDecisionInput,
	VariantDecisionPayload,
	VariantReviewResult,
} from "@reactive-resume/schema/resume/variants";
import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/client";
import { and, asc, eq, isNull } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { aiOperation, aiReviewDecision, resume, resumeVariantSource } from "@reactive-resume/db/schema";
import { blockText, readTarget, writeTarget } from "@reactive-resume/resume/proposals";
import { buildTranslationInventory, translationPlaceholders } from "@reactive-resume/resume/translation";
import { reviewTargetSchema } from "@reactive-resume/schema/resume/ai-review";
import {
	variantDecisionInputSchema,
	variantDecisionPayloadSchema,
	variantReviewResultSchema,
} from "@reactive-resume/schema/resume/variants";
import { parseResumeDataForWrite } from "@reactive-resume/schema/resume/write";
import { escapeHtml, generateId } from "@reactive-resume/utils/string";
import { lockDocumentOwner } from "../documents/ownership";
import { notifyResumeUpdated, updateResumeTx } from "../resume/service";
import { applyReviewedTranslation } from "../resume/variants";
import { writeVersion } from "../resume/version-history";
import { canonicalJson } from "./route-policy";
import { loadVariantSnapshot } from "./variant-sources";

function conflict(reason = "AI_SOURCE_CHANGED"): never {
	throw new ORPCError("CONFLICT", { data: { reason } });
}
type Decision = typeof aiReviewDecision.$inferSelect;
async function context(tx: OwnerTransaction, ownerId: string, operationId: string) {
	await lockDocumentOwner(tx, ownerId);
	const [operation] = await tx
		.select()
		.from(aiOperation)
		.where(and(eq(aiOperation.userId, ownerId), eq(aiOperation.id, operationId)))
		.for("update");
	if (!operation?.result || !operation.deliveredAt || !["waiting_review", "succeeded"].includes(operation.state))
		throw new ORPCError("NOT_FOUND");
	const result = variantReviewResultSchema.parse(operation.result);
	if (result.kind !== operation.kind || result.sourceRevision.kind !== "resume") throw new ORPCError("NOT_FOUND");
	const [document] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, result.sourceRevision.id), isNull(resume.trashedAt)))
		.for("update");
	if (!document) throw new ORPCError("NOT_FOUND");
	const decisions = await tx
		.select()
		.from(aiReviewDecision)
		.where(and(eq(aiReviewDecision.userId, ownerId), eq(aiReviewDecision.operationId, operationId)))
		.orderBy(asc(aiReviewDecision.createdAt), asc(aiReviewDecision.id));
	const [provenance] = await tx
		.select()
		.from(resumeVariantSource)
		.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, document.id)))
		.for("update");
	return { operation, result, document, decisions, provenance };
}
type Context = Awaited<ReturnType<typeof context>>;
const subjectIds = (result: VariantReviewResult): string[] =>
	result.kind === "review.translation"
		? [...result.output.segments.map((segment) => segment.sourceId), "translation"]
		: result.kind === "review.tailoring"
			? [...result.output.patches.map((patch) => patch.id), ...(result.output.order.length ? ["order"] : [])]
			: [result.kind === "review.summary" ? "summary" : "report"];
function statuses(result: VariantReviewResult, decisions: Decision[]) {
	const value: Record<string, "pending" | "accepted" | "rejected"> = Object.fromEntries(
		subjectIds(result).map((id) => [id, "pending"]),
	);
	for (const event of decisions)
		if (["accept", "accept_edited", "reject", "undo"].includes(event.event))
			for (const id of event.subjectIds)
				if (Object.hasOwn(value, id))
					value[id] = event.event === "undo" ? "pending" : event.event === "reject" ? "rejected" : "accepted";
	if (result.kind === "review.translation")
		for (const [id, segment] of Object.entries(decisions.at(-1)?.variantPayload?.segments ?? {}))
			value[id] = segment.status;
	return value;
}
function previousPayload(ctx: Context) {
	const stored = ctx.decisions.at(-1)?.variantPayload;
	return stored ? variantDecisionPayloadSchema.parse(stored) : null;
}
async function translationSource(tx: OwnerTransaction, ownerId: string, ctx: Context) {
	const id = ctx.provenance?.sourceResumeId;
	const sourcePin = ctx.operation.sources.find((source) => source.kind === "resume" && source.id === id);
	if (!id || !sourcePin) conflict();
	const [source] = await tx
		.select()
		.from(resume)
		.where(and(eq(resume.userId, ownerId), eq(resume.id, id), isNull(resume.trashedAt)))
		.for("share");
	if (!source || source.isLocked || source.updatedAt.toISOString() !== sourcePin.revision) conflict();
	return source;
}
async function initialPayload(tx: OwnerTransaction, ownerId: string, ctx: Context): Promise<VariantDecisionPayload> {
	const payload: VariantDecisionPayload = {
		schemaVersion: 1,
		kind: ctx.result.kind,
		terms: { schemaVersion: 1, terms: [] },
		segments: {},
		before: null,
		after: null,
	};
	if (ctx.result.kind !== "review.translation") return payload;
	const source = await translationSource(tx, ownerId, ctx);
	const inventory = buildTranslationInventory(source.data);
	if (inventory.blocking.length) conflict("TRANSLATION_PARTIAL_COVERAGE");
	payload.terms.terms = inventory.segments
		.filter((segment) => segment.official)
		.map((segment) => ({
			id: `term:${segment.id}`,
			sourceRevision: ctx.result.sourceRevision.revision,
			target: segment.target,
			source: segment.text,
			value: segment.text,
			status: "pending",
			author: "source",
		}));
	payload.segments = Object.fromEntries(
		ctx.result.output.segments.map((segment) => [
			segment.sourceId,
			{ text: segment.text, status: "pending", author: "model" },
		]),
	);
	return payload;
}
const snapshotProvenance = (value: Context["provenance"]) =>
	value
		? {
				acceptedSourceRevision: value.acceptedSourceRevision,
				terminology: value.terminology,
				acceptedFactRevisions: value.acceptedFactRevisions,
			}
		: null;
async function assertCurrent(tx: OwnerTransaction, ownerId: string, ctx: Context) {
	const lastChange = ctx.decisions.findLast(
		(decision) => decision.variantPayload?.after !== null && decision.variantPayload?.after !== undefined,
	);
	if (ctx.document.updatedAt.toISOString() !== (lastChange?.afterRevision ?? ctx.result.sourceRevision.revision))
		conflict();
	const revision = ctx.document.updatedAt.toISOString();
	await loadVariantSnapshot(tx, ownerId, {
		kind: ctx.operation.kind,
		parameters: { ...ctx.operation.parameters, expectedUpdatedAt: revision },
		sources: ctx.operation.sources.map((source) =>
			source.kind === "resume" && source.id === ctx.document.id ? { ...source, revision } : source,
		),
	});
}

export function getVariantReview(ownerId: string, operationId: string) {
	return withOwnerDatabase(ownerId, async (tx) => {
		const ctx = await context(tx, ownerId, operationId);
		let stale = false;
		try {
			await assertCurrent(tx, ownerId, ctx);
		} catch (error) {
			if (error instanceof ORPCError && ["CONFLICT", "NOT_FOUND", "RESUME_LOCKED"].includes(error.code)) stale = true;
			else throw error;
		}
		const empty: Pick<VariantDecisionPayload, "terms" | "segments"> = {
			terms: { schemaVersion: 1, terms: [] },
			segments: {},
		};
		const payload = previousPayload(ctx) ?? (stale ? empty : await initialPayload(tx, ownerId, ctx));
		const sourceSegments =
			ctx.result.kind === "review.translation" && !stale
				? buildTranslationInventory((await translationSource(tx, ownerId, ctx)).data).segments.map((segment) => ({
						id: segment.id,
						text: segment.text,
					}))
				: ctx.result.kind === "review.job-evidence" && !stale
					? ((await loadVariantSnapshot(tx, ownerId, ctx.operation)).jobAd?.segments ?? [])
					: [];
		// Inference tokens stay in the operation ledger. Resolve them only in this owner-scoped view.
		const result = structuredClone(ctx.result);
		const segments = structuredClone(payload.segments);
		if (result.kind === "review.translation") {
			if (stale) {
				// A stale source cannot safely reconstruct the token registry. Keep the recovery notice, withhold comparisons.
				result.output.segments = [];
				result.output.notes = [];
				for (const id of Object.keys(segments)) delete segments[id];
			} else {
				const source = await translationSource(tx, ownerId, ctx);
				const placeholders = translationPlaceholders(source.data);
				const resolve = (text: string) =>
					placeholders.reduce(
						(value, entry) =>
							value.replaceAll(
								entry.token,
								payload.terms.terms.find((term) => term.source === entry.value)?.value ?? entry.value,
							),
						text,
					);
				for (const segment of result.output.segments) {
					const term = payload.terms.terms.find((term) => term.id === `term:${segment.sourceId}`);
					const reviewed = segments[segment.sourceId];
					segment.text = term?.value ?? resolve(reviewed?.text ?? segment.text);
					if (reviewed) reviewed.text = segment.text;
					for (const claim of segment.claims) claim.text = resolve(claim.text);
				}
				result.output.notes = result.output.notes.map(resolve);
			}
		}
		return {
			beforeSummary: ctx.document.data.summary.content,
			answeredQuestionIds: ctx.decisions
				.filter((event) => event.event === "answer")
				.flatMap((event) => event.subjectIds),
			dismissedQuestionIds: ctx.decisions
				.filter((event) => event.event === "dismiss_question")
				.flatMap((event) => event.subjectIds),
			sourceSegments,
			result,
			statuses: statuses(ctx.result, ctx.decisions),
			terms: payload.terms,
			segments,
			updatedAt: ctx.document.updatedAt.toISOString(),
			latestDecisionId: ctx.decisions.at(-1)?.id ?? null,
			stale,
			undoable: ctx.decisions
				.filter(
					(event) =>
						(event.variantPayload?.after ||
							(ctx.result.kind === "review.translation" &&
								["accept", "accept_edited", "reject"].includes(event.event) &&
								event.subjectIds.every((id) => Boolean(event.variantPayload?.segments[id])) &&
								event.afterRevision === ctx.document.updatedAt.toISOString())) &&
						!ctx.decisions.some((later) => later.previousDecisionId === event.id),
				)
				.map((event) => ({ decisionId: event.id, subjectIds: event.subjectIds })),
		};
	});
}

/** Appends to the existing immutable ledger. Pending translation decisions never save a partial document. */
export async function decideVariantReview(ownerId: string, raw: VariantDecisionInput) {
	const input = variantDecisionInputSchema.parse(raw);
	const fingerprint = createHash("sha256").update(canonicalJson(input)).digest("hex");
	let changed = false;
	const response = await withOwnerDatabase(ownerId, async (tx) => {
		const ctx = await context(tx, ownerId, input.operationId);
		const [replay] = await tx
			.select()
			.from(aiReviewDecision)
			.where(and(eq(aiReviewDecision.userId, ownerId), eq(aiReviewDecision.requestKey, input.requestKey)));
		if (replay) {
			if (replay.fingerprint !== fingerprint || !replay.response) conflict("AI_REQUEST_KEY_REUSED");
			return replay.response;
		}
		if (ctx.document.isLocked) throw new ORPCError("RESUME_LOCKED", { status: 403 });
		if (
			ctx.document.updatedAt.toISOString() !== input.expectedUpdatedAt ||
			(ctx.decisions.at(-1)?.id ?? null) !== input.expectedDecisionId
		)
			conflict();
		if (input.decision !== "reject" && input.decision !== "undo") await assertCurrent(tx, ownerId, ctx);
		const payload = structuredClone(previousPayload(ctx) ?? (await initialPayload(tx, ownerId, ctx)));
		payload.before = null;
		payload.after = null;
		const currentStatuses = statuses(ctx.result, ctx.decisions);
		const terms = new Set(payload.terms.terms.map((term) => term.id));
		if (input.subjectIds.some((id) => !Object.hasOwn(currentStatuses, id) && !terms.has(id)))
			throw new ORPCError("NOT_FOUND");
		let data = structuredClone(ctx.document.data);
		let nextProvenance = snapshotProvenance(ctx.provenance);
		let save = false;
		if (input.decision === "undo") {
			const accepted = ctx.decisions.find((event) => event.id === input.undoDecisionId);
			if (
				!accepted ||
				ctx.decisions.some((event) => event.previousDecisionId === accepted.id) ||
				canonicalJson([...input.subjectIds].sort()) !== canonicalJson([...accepted.subjectIds].sort()) ||
				accepted.afterRevision !== ctx.document.updatedAt.toISOString()
			)
				conflict("AI_UNDO_CHANGED");
			if (ctx.result.kind === "review.translation" && !accepted.variantPayload?.after) {
				if (
					!["accept", "accept_edited", "reject"].includes(accepted.event) ||
					!input.subjectIds.every((id) => Boolean(accepted.variantPayload?.segments[id]))
				)
					conflict("AI_UNDO_CHANGED");
				const index = ctx.decisions.indexOf(accepted);
				const prior = ctx.decisions[index - 1]?.variantPayload ?? (await initialPayload(tx, ownerId, ctx));
				for (const id of input.subjectIds) {
					const segment = prior.segments[id];
					if (!segment) conflict("AI_UNDO_CHANGED");
					payload.segments[id] = structuredClone(segment);
				}
			} else {
				if (
					!accepted?.variantPayload?.before ||
					!accepted.variantPayload.after ||
					ctx.decisions.some((event) => event.previousDecisionId === accepted.id) ||
					canonicalJson([...input.subjectIds].sort()) !== canonicalJson([...accepted.subjectIds].sort()) ||
					accepted.afterRevision !== ctx.document.updatedAt.toISOString() ||
					canonicalJson(accepted.variantPayload.after.data) !== canonicalJson(ctx.document.data) ||
					canonicalJson(accepted.variantPayload.after.provenance) !== canonicalJson(snapshotProvenance(ctx.provenance))
				)
					conflict("AI_UNDO_CHANGED");
				data = structuredClone(accepted.variantPayload.before.data);
				nextProvenance = structuredClone(accepted.variantPayload.before.provenance);
				save = true;
			}
		} else if (input.subjectIds.some((id) => terms.has(id))) {
			if (input.subjectIds.length !== 1 || input.decision === "reject") throw new ORPCError("BAD_REQUEST");
			const term = payload.terms.terms.find((term) => term.id === input.subjectIds[0]);
			if (!term) throw new ORPCError("NOT_FOUND");
			term.value = input.editedText ?? term.value;
			term.status = "confirmed";
			term.author = input.editedText === undefined ? "source" : "user";
			const segmentId = term.id.slice("term:".length);
			if (payload.segments[segmentId]) payload.segments[segmentId].status = "pending";
		} else {
			if (input.subjectIds.some((id) => currentStatuses[id] !== "pending")) conflict("AI_DECISION_CHANGED");
			if (ctx.result.kind === "review.translation") {
				if (input.subjectIds.includes("translation")) {
					if (input.subjectIds.length !== 1 || input.decision === "accept_edited") throw new ORPCError("BAD_REQUEST");
					if (input.decision === "accept") {
						if (
							Object.values(payload.segments).some((segment) => segment.status !== "accepted") ||
							payload.terms.terms.some((term) => term.status !== "confirmed")
						)
							conflict("TRANSLATION_REVIEW_INCOMPLETE");
						const source = await translationSource(tx, ownerId, ctx);
						const applied = await applyReviewedTranslation(tx, ownerId, {
							resumeId: ctx.document.id,
							sourceResumeId: source.id,
							expectedSourceRevision: source.updatedAt.toISOString(),
							data,
							payload,
						});
						data = applied.data;
						nextProvenance = applied.provenance;
						save = true;
					}
				} else
					for (const id of input.subjectIds) {
						const segment = payload.segments[id];
						if (!segment) throw new ORPCError("NOT_FOUND");
						segment.status = input.decision === "reject" ? "rejected" : "accepted";
						if (input.editedText !== undefined) {
							segment.text = input.editedText;
							segment.author = "user";
							const term = payload.terms.terms.find((term) => term.id === `term:${id}`);
							if (term) term.status = "pending";
						}
					}
			} else if (input.decision !== "reject" && ctx.result.kind === "review.summary") {
				const text = input.editedText ?? ctx.result.output.summary.text;
				if (!text.trim()) throw new ORPCError("BAD_REQUEST");
				data.summary.content = `<p>${escapeHtml(text)}</p>`;
				save = true;
			} else if (input.decision !== "reject" && ctx.result.kind === "review.tailoring") {
				for (const patch of ctx.result.output.patches.filter((patch) => input.subjectIds.includes(patch.id))) {
					const target = reviewTargetSchema.parse({
						sectionId: patch.target.sectionId,
						field: patch.target.field,
						...(patch.target.itemId ? { itemId: patch.target.itemId } : {}),
						...(patch.target.roleId ? { roleId: patch.target.roleId } : {}),
					});
					const current = readTarget(data, target);
					if (
						current === undefined ||
						blockText(current) !== blockText(patch.before) ||
						/\[(?:redacted|NAME_\d+)\]/iu.test(patch.before)
					)
						conflict();
					writeTarget(data, target, `<p>${escapeHtml(input.editedText ?? patch.after)}</p>`);
				}
				if (input.subjectIds.includes("order"))
					for (const order of ctx.result.output.order) {
						const section = data.sections[order.sectionId as keyof typeof data.sections];
						if (!section || section.items.length !== order.itemIds.length) conflict();
						const positions = new Map(order.itemIds.map((id, index) => [id, index]));
						if (section.items.some((item) => !positions.has(item.id))) conflict();
						section.items.sort((a, b) => {
							const left = positions.get(a.id);
							const right = positions.get(b.id);
							if (left === undefined || right === undefined) conflict();
							return left - right;
						});
					}
				save = true;
			}
		}
		let updatedAt = ctx.document.updatedAt.toISOString();
		let historyVersionId: string | null = null;
		if (save) {
			data = parseResumeDataForWrite(data);
			payload.before = { data: ctx.document.data, provenance: snapshotProvenance(ctx.provenance) };
			payload.after = { data, provenance: nextProvenance };
			const saved = await updateResumeTx(tx, {
				id: ctx.document.id,
				userId: ownerId,
				data,
				expectedUpdatedAt: ctx.document.updatedAt,
				skipAutoSnapshot: true,
			});
			updatedAt = saved.updatedAt.toISOString();
			if (nextProvenance)
				await tx
					.update(resumeVariantSource)
					.set(nextProvenance)
					.where(and(eq(resumeVariantSource.userId, ownerId), eq(resumeVariantSource.resumeId, ctx.document.id)));
			historyVersionId = (await writeVersion(tx, { resumeId: ctx.document.id, userId: ownerId, data, kind: "ai" })).id;
			changed = true;
		}
		for (const id of input.subjectIds)
			if (Object.hasOwn(currentStatuses, id))
				currentStatuses[id] =
					input.decision === "undo" ? "pending" : input.decision === "reject" ? "rejected" : "accepted";
		const response = {
			decisionId: generateId(),
			operationId: input.operationId,
			statuses: currentStatuses,
			resumeId: ctx.document.id,
			updatedAt,
			data,
		};
		await tx.insert(aiReviewDecision).values({
			id: response.decisionId,
			userId: ownerId,
			operationId: input.operationId,
			resumeId: ctx.document.id,
			requestKey: input.requestKey,
			fingerprint,
			event: input.decision,
			subjectIds: input.subjectIds,
			previousDecisionId: input.undoDecisionId ?? null,
			beforeRevision: ctx.document.updatedAt.toISOString(),
			afterRevision: updatedAt,
			historyVersionId,
			response,
			variantPayload: variantDecisionPayloadSchema.parse(payload),
			createdAt: new Date(Math.max(Date.now(), (ctx.decisions.at(-1)?.createdAt.getTime() ?? 0) + 1)),
		});
		if (Object.values(currentStatuses).every((status) => status !== "pending"))
			await tx.update(aiOperation).set({ state: "succeeded" }).where(eq(aiOperation.id, ctx.operation.id));
		return response;
	});
	if (changed)
		await notifyResumeUpdated({
			type: "resume.updated",
			resumeId: response.resumeId,
			userId: ownerId,
			updatedAt: response.updatedAt,
			mutation: "update",
		});
	return response;
}
