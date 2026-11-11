import { createHash } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import * as t from "@reactive-resume/db/schema";
import { buildCareerFactCandidates } from "@reactive-resume/import/career-facts";
import { importReviewInputSchema, type ImportReviewInput } from "@reactive-resume/schema/resume/import-review";
import { localeSchema } from "@reactive-resume/utils/locale";
import { generateId } from "@reactive-resume/utils/string";
import { protectedProcedure } from "../../context";
import { resumeMutationRateLimit } from "../../middleware/rate-limit";
import { careerMasterService } from "../career/master";
import { lockDocumentOwner } from "../documents/ownership";
import { resumeService, notifyResumeUpdated } from "./service";

const canonical = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object")
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
			.join(",")}}`;
	return JSON.stringify(value);
};
export async function confirmImport(userId: string, value: ImportReviewInput) {
	const input = importReviewInputSchema.parse(value);
	const hash = createHash("sha256").update(canonical(input)).digest("hex");
	const newGroups = new Set(
		input.acceptedFacts.filter((a) => a.decision.kind === "new").map((a) => `${a.fact.section}:${a.fact.entityId}`),
	);
	const profileRevision = input.expectedProfileRevision + newGroups.size;
	const result = await withOwnerDatabase(userId, async (tx) => {
		await lockDocumentOwner(tx, userId);
		const [existing] = await tx
			.select()
			.from(t.resume)
			.where(and(eq(t.resume.userId, userId), eq(t.resume.importFlowId, input.flowId)));
		if (existing) {
			if (existing.importFlowHash !== hash || existing.trashedAt) throw new ORPCError("CONFLICT");
			return { resumeId: existing.id, profileRevision };
		}
		let master = await careerMasterService.read(userId);
		if (master.profileRevision !== input.expectedProfileRevision)
			throw new ORPCError("IMPORT_REVIEW_CONFLICT", { status: 409 });
		const id = generateId();
		const candidates = buildCareerFactCandidates(input.data, { kind: "resume", id, quote: "" });
		const keys = new Set<string>();
		for (const { fact } of input.acceptedFacts) {
			const key = `${fact.section}:${fact.entityId}:${fact.field}`;
			if (
				keys.has(key) ||
				!candidates.some(
					(c) =>
						c.section === fact.section &&
						c.entityId === fact.entityId &&
						c.field === fact.field &&
						canonical(c.value) === canonical(fact.value),
				)
			)
				throw new ORPCError("BAD_REQUEST", { message: "Review facts against the CV before confirming." });
			keys.add(key);
		}
		await resumeService.create(
			{
				id,
				userId,
				name: input.name,
				tags: [],
				locale: localeSchema.parse(input.data.metadata.page.locale),
				data: input.data,
				origin: "import",
			},
			{ atomicConfirmation: true },
		);
		await tx
			.update(t.resume)
			.set({ importFlowId: input.flowId, importFlowHash: hash })
			.where(and(eq(t.resume.id, id), eq(t.resume.userId, userId)));
		const links: Array<{ factId: string; acceptedRevision: number }> = [];
		for (const group of newGroups) {
			const pending = [];
			for (const { fact, decision } of input.acceptedFacts) {
				if (decision.kind !== "new" || `${fact.section}:${fact.entityId}` !== group) continue;
				const saved = await careerMasterService.savePending(
					userId,
					{
						...fact,
						source: {
							kind: "resume",
							id,
							quote:
								fact.source.quote ||
								(typeof fact.value === "string"
									? fact.value.slice(0, 4000)
									: JSON.stringify(fact.value).slice(0, 4000)),
						},
					},
					id,
				);
				pending.push({ id: saved.id, expectedRevision: saved.revision, expectedDraftRevision: saved.draftRevision });
			}
			// Each supported entity has at most seven factual fields, below the existing 30-fact bound.
			master = await careerMasterService.confirm(userId, {
				facts: pending,
				expectedProfileRevision: master.profileRevision,
			});
			for (const saved of pending) {
				const fact = master.facts.find((f) => f.id === saved.id);
				if (!fact) throw new ORPCError("INTERNAL_SERVER_ERROR");
				links.push({ factId: fact.id, acceptedRevision: fact.revision });
			}
		}
		for (const { fact, decision } of input.acceptedFacts) {
			if (decision.kind !== "existing") continue;
			const saved = master.facts.find((f) => f.id === decision.id);
			if (!saved || saved.confirmation !== "confirmed" || !saved.structured) throw new ORPCError("NOT_FOUND");
			if (saved.revision !== decision.expectedRevision || saved.draftRevision !== decision.expectedDraftRevision)
				throw new ORPCError("IMPORT_REVIEW_CONFLICT", { status: 409 });
			const accepted = saved.structured;
			if (
				accepted.section !== fact.section ||
				accepted.entityId !== fact.entityId ||
				accepted.field !== fact.field ||
				canonical(accepted.value) !== canonical(fact.value)
			)
				throw new ORPCError("BAD_REQUEST");
			links.push({ factId: saved.id, acceptedRevision: saved.revision });
		}
		await careerMasterService.linkResumeFacts(userId, { resumeId: id, links });
		return { resumeId: id, profileRevision: master.profileRevision };
	});
	await notifyResumeUpdated({
		type: "resume.updated",
		resumeId: result.resumeId,
		userId,
		updatedAt: new Date().toISOString(),
		mutation: "create",
	});
	return result;
}
export const confirmImportProcedure = protectedProcedure
	.route({
		method: "POST",
		path: "/resumes/import-confirmations",
		tags: ["Resumes"],
		operationId: "confirmResumeImport",
		summary: "Create a CV and explicitly accepted master facts atomically",
	})
	.input(importReviewInputSchema)
	.use(resumeMutationRateLimit)
	.output(z.object({ resumeId: z.string(), profileRevision: z.number().int().nonnegative() }))
	.handler(({ context, input }) => confirmImport(context.user.id, input));
