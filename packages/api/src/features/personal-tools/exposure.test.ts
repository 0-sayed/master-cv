import { expect, it, vi } from "vite-plus/test";
import { call } from "@orpc/server";

const auth = vi.hoisted(() => ({ api: { getSession: vi.fn() } }));
vi.mock("@reactive-resume/auth/config", () => ({ auth, verifyOAuthToken: vi.fn() }));
vi.mock("@reactive-resume/db/client", () => ({ db: {} }));
vi.mock("@reactive-resume/db/owner-scope", () => ({ withDatabaseOwner: (_id: string, work: () => unknown) => work() }));
const { publicProcedure } = await import("../../context");

it.each([
	{ path: "/ai-providers" },
	{ path: "/auth/api-keys" },
	{ path: "/auth/api-keys/{keyId}" },
	{ path: "/agent/messages/send" },
	{ path: "/integrations/web-access" },
	{ path: "/career/workspace" },
	{ path: "/applications/{id}/ai/tailor-resume" },
	{ path: "/applications/ai/search" },
	{ path: "/ai/improve" },
	{ tags: ["Resume Sharing"] },
	{ operationId: "getResumeBySlug" },
	{ operationId: "recordResumeDownload" },
] as const)("denies deferred procedure metadata %j before authentication or handler work", async (route) => {
	const handler = vi.fn();
	const procedure = publicProcedure.route(route).handler(handler);
	await expect(
		call(procedure, undefined, { context: { reqHeaders: new Headers(), locale: "en-US" } }),
	).rejects.toMatchObject({ code: "FORBIDDEN", message: "FEATURE_UNAVAILABLE" });
	expect(handler).not.toHaveBeenCalled();
	expect(auth.api.getSession).not.toHaveBeenCalled();
});
