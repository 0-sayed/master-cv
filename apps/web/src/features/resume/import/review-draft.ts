import z from "zod";
import { sourceRevisionSchema } from "@reactive-resume/schema/ai-operation";
import { masterFactSchema } from "@reactive-resume/schema/career-master";
import { reviewResultSchema } from "@reactive-resume/schema/resume/ai-review";
import { resumeDataSchema } from "@reactive-resume/schema/resume/data";
import { importReviewInputSchema } from "@reactive-resume/schema/resume/import-review";

const stateSchema = z.object({
	data: resumeDataSchema,
	confirmed: z.record(z.string(), z.string()).default({}),
	reviewed: z.record(z.string(), z.string()).default({}),
	active: z.string().default("basics"),
	reused: z.array(masterFactSchema).default([]),
	revision: z.number().int().nonnegative().optional(),
	confirmationFlow: z.uuid(),
	needsReconciliation: z.boolean().default(false),
	changedMasterFacts: z.array(z.string()).default([]),
	submission: importReviewInputSchema.optional(),
	aiReview: z
		.strictObject({
			version: z.literal(1),
			source: sourceRevisionSchema,
			operationId: z.string().min(1),
			result: reviewResultSchema.nullable(),
			draftGeneration: z.string(),
			appliedCandidateIds: z.array(z.string()).default([]),
		})
		.optional(),
});
export type ReviewState = z.infer<typeof stateSchema>;
const draftSchema = z.object({
	version: z.literal(1),
	ownerId: z.string().min(1),
	flowId: z.uuid(),
	expiresAt: z.number(),
	file: z.instanceof(File),
	initial: resumeDataSchema,
	pages: z.array(z.object({ page: z.number().int().positive(), text: z.string() })),
	issues: z.array(
		z.object({ field: z.enum(["name", "headline", "location", "position", "company", "phone"]), source: z.string() }),
	),
	partial: z.boolean(),
	state: stateSchema,
});
export type ReviewDraft = z.infer<typeof draftSchema>;
export const createReviewState = (data: ReviewState["data"], flowId: string): ReviewState =>
	stateSchema.parse({ data, confirmationFlow: flowId });
type Identity = { ownerId: string; flowId: string };
const RETENTION_MS = 24 * 60 * 60 * 1000;
const STORE = "drafts";
const key = (identity: Identity) => JSON.stringify([identity.ownerId, identity.flowId]);
function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open("master-cv-import-review", 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
	});
}
async function transaction<T>(work: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			let result: T;
			tx.oncomplete = () => resolve(result);
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error ?? new Error("Import draft transaction aborted"));
			work(tx.objectStore(STORE), (value) => {
				result = value;
			});
		});
	} finally {
		db.close();
	}
}
export async function saveReviewDraft(value: ReviewDraft): Promise<void> {
	const parsed = draftSchema.parse(value);
	if (parsed.file.size > 25_000_000 || parsed.expiresAt <= Date.now() || parsed.expiresAt > Date.now() + RETENTION_MS)
		throw new Error("Invalid import draft");
	await transaction<void>((store) => {
		// Retention cleanup is local only. No file is uploaded or attached to a CV.
		const cursor = store.openCursor();
		cursor.onsuccess = () => {
			const row = cursor.result;
			if (!row) return;
			if (row.value.expiresAt <= Date.now()) row.delete();
			row.continue();
		};
		store.put(parsed, key(parsed));
	});
}
export function readReviewDraft(identity: Identity): Promise<ReviewDraft | null> {
	return transaction<ReviewDraft | null>((store, result) => {
		const request = store.get(key(identity));
		request.onsuccess = () => {
			const parsed = draftSchema.safeParse(request.result);
			if (
				!parsed.success ||
				parsed.data.ownerId !== identity.ownerId ||
				parsed.data.flowId !== identity.flowId ||
				parsed.data.expiresAt <= Date.now() ||
				parsed.data.expiresAt > Date.now() + RETENTION_MS
			) {
				store.delete(key(identity));
				result(null);
				return;
			}
			result(parsed.data);
		};
	});
}
export async function removeReviewDraft(identity: Identity): Promise<void> {
	await transaction<void>((store) => {
		store.delete(key(identity));
	});
}
