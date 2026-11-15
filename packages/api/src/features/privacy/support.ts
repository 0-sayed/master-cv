import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { claimPrivacyWork, completePrivacyWork, retryPrivacyWork } from "./work";
export const supportInputSchema = z.object({
	email: z
		.email()
		.max(254)
		.refine((value) => !/[\r\n]/.test(value)),
	subject: z.enum(["export", "plan", "privacy", "other"]),
	message: z.string().trim().min(1).max(10000),
	locale: z.enum(["ar-SA", "en-US"]).default("ar-SA"),
	requestNonce: z.string().min(1).max(128),
});
export type SupportCase = z.infer<typeof supportInputSchema> & { id: string; userId: string | null; status: string };
/** authentication is resolved by the route, never accepted from intake fields. */
export async function submitSupportRequest(
	input: z.input<typeof supportInputSchema> & { authentication?: { userId: string } },
): Promise<{ id: string; status: "received" }> {
	const data = supportInputSchema.parse(input);
	const submit = async () => {
		try {
			const result = await db.execute<{ id: string }>(
				sql`SELECT master_cv_submit_support(${randomUUID()},${input.authentication?.userId ?? null},${data.requestNonce},${data.email},${data.subject},${data.message},${data.locale}) AS id`,
			);
			const id = result.rows[0]?.id;
			if (!id) throw new Error("SUPPORT_INTAKE_FAILED");
			return { id, status: "received" as const };
		} catch (error) {
			const cause = error instanceof Error ? error.cause : null;
			const message = cause instanceof Error ? cause.message : "";
			throw new Error(/^SUPPORT_[A-Z_]+$/.test(message) ? message : "SUPPORT_INTAKE_FAILED");
		}
	};
	return input.authentication ? await withOwnerDatabase(input.authentication.userId, submit) : await submit();
}
/** No production routing until operator/sender/policy approval. Tests supply a scripted adapter. */
export async function runSupportWork(input: { workId: string; deliver?: (item: SupportCase) => Promise<void> }) {
	const claim = await claimPrivacyWork({ workId: input.workId, kind: "send_support" });
	if (!claim) return;
	try {
		const item = await withOwnerDatabase(claim.userId, async (tx) => {
			const result = await tx.execute<{ item: SupportCase }>(
				sql`SELECT master_cv_support_delivery(${claim.id},${claim.leaseToken}) AS item`,
			);
			return result.rows[0]?.item;
		});
		if (!item) throw new Error("SUPPORT_CASE_UNAVAILABLE");
		if (!input.deliver) throw new Error("SUPPORT_ROUTING_UNAVAILABLE");
		await input.deliver(item);
		await completePrivacyWork(claim);
	} catch {
		await retryPrivacyWork(claim, "SUPPORT_DELIVERY_REQUIRED");
	}
}
/** Only a separately provisioned operator connection can call these audited projections. */
export async function readSupportRequest(input: { operatorId: string; requestId: string; purpose: string }) {
	const result = await db.execute<{ item: SupportCase }>(
		sql`SELECT master_cv_read_support_request(${input.operatorId},${input.requestId},${input.purpose}) AS item`,
	);
	return result.rows[0]?.item;
}
export async function recordSupportDisposition(input: { operatorId: string; requestId: string; disposition: string }) {
	await db.execute(
		sql`SELECT master_cv_support_disposition(${input.operatorId},${input.requestId},${input.disposition})`,
	);
}
