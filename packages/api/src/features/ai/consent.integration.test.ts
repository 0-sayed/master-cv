import { describe, expect, it } from "vite-plus/test";
import { processingConsentService } from "./consent";
import { resolveApprovedRoute, withAiRuntime } from "./route-policy";
import { aiTestDatabase } from "./testing/database";
import { syntheticRoute, syntheticRuntime } from "./testing/runtime";

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("processing consent configuration binding", () => {
	const database = aiTestDatabase();
	it("requires a new grant after a configuration revision and invalidates the old configuration", async () => {
		const request = {
			requestKey: "consent",
			kind: "review",
			sources: [{ kind: "resume" as const, id: "cv", revision: "1" }],
			route: { routeId: "synthetic", routeRevision: "1", configRevision: "1" },
			consentVersion: "1",
			parameters: {},
		};
		const grant = (route: typeof request.route) =>
			processingConsentService.grant("alice", { route, purpose: "review", noticeVersion: "1" });
		await database.run(() =>
			withAiRuntime(syntheticRuntime, async () => {
				await grant(request.route);
				expect(await resolveApprovedRoute("alice", request)).toMatchObject({ configRevision: "1" });
			}),
		);
		const route = { ...request.route, configRevision: "2" };
		await database.run(() =>
			withAiRuntime({ ...syntheticRuntime, routes: [{ ...syntheticRoute, configRevision: "2" }] }, async () => {
				await expect(resolveApprovedRoute("alice", { ...request, route })).rejects.toMatchObject({
					data: { reason: "AI_CONSENT_REQUIRED" },
				});
				await grant(route);
				expect(await resolveApprovedRoute("alice", { ...request, route })).toMatchObject({ configRevision: "2" });
			}),
		);
		await database.run(() =>
			withAiRuntime(syntheticRuntime, async () => {
				await expect(resolveApprovedRoute("alice", request)).rejects.toMatchObject({
					data: { reason: "AI_CONSENT_REQUIRED" },
				});
			}),
		);
	});
});
