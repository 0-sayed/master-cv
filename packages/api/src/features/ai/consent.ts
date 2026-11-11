import type { RouteBinding } from "@reactive-resume/schema/ai-operation";
import { ORPCError } from "@orpc/client";
import { and, eq } from "drizzle-orm";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { aiProcessingConsent } from "@reactive-resume/db/schema";
import { assertLegacyAiDenied, getAiRuntime, getAiAvailability, getOperationHandler } from "./route-policy";

export function getProcessingNotices() {
	if (getAiAvailability().state !== "ready") return [];
	return getAiRuntime().routes.map((r) => ({
		route: { routeId: r.routeId, routeRevision: r.routeRevision, configRevision: r.configRevision },
		noticeVersion: r.noticeVersion,
		purposes: Object.keys(getAiRuntime().handlers),
	}));
}
export const processingConsentService = {
	grant: (userId: string, input: { route: RouteBinding; purpose: string; noticeVersion: string }) => {
		const notice = getProcessingNotices().find(
			(n) =>
				n.route.routeId === input.route.routeId &&
				n.route.routeRevision === input.route.routeRevision &&
				n.route.configRevision === input.route.configRevision &&
				n.noticeVersion === input.noticeVersion,
		);
		if (!notice) assertLegacyAiDenied();
		getOperationHandler(input.purpose);
		return withOwnerDatabase(userId, async (tx) => {
			const [row] = await tx
				.insert(aiProcessingConsent)
				.values({
					userId,
					routeId: input.route.routeId,
					routeRevision: input.route.routeRevision,
					noticeVersion: input.noticeVersion,
					purpose: input.purpose,
				})
				.onConflictDoUpdate({
					target: [
						aiProcessingConsent.userId,
						aiProcessingConsent.routeId,
						aiProcessingConsent.routeRevision,
						aiProcessingConsent.noticeVersion,
						aiProcessingConsent.purpose,
					],
					set: { grantedAt: new Date(), revokedAt: null },
				})
				.returning({ id: aiProcessingConsent.id });
			if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
			return row;
		});
	},
	revoke: (userId: string, routeId: string) =>
		withOwnerDatabase(userId, async (tx) => {
			await tx
				.update(aiProcessingConsent)
				.set({ revokedAt: new Date() })
				.where(and(eq(aiProcessingConsent.userId, userId), eq(aiProcessingConsent.routeId, routeId)));
		}),
};
