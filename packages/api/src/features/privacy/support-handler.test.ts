import { afterEach, expect, it, vi } from "vite-plus/test";
import { createRouterClient } from "@orpc/server";
import { privacyRouter } from "./router";
import { submitSupportRequest } from "./support";

vi.mock("../../context", async () => {
	const { os } = await import("@orpc/server");
	const procedure = os.$context<{
		user: { id: string; email: string; emailVerified: boolean } | null;
		reqHeaders: Headers;
	}>();
	return { publicProcedure: procedure, protectedProcedure: procedure };
});
vi.mock("@reactive-resume/auth/account-access", () => ({}));
vi.mock("@reactive-resume/auth/account-changes", () => ({}));
vi.mock("@reactive-resume/db/owner-scope", () => ({}));
vi.mock("./deletion", () => ({}));
vi.mock("./delivery", () => ({}));
vi.mock("./export", () => ({}));
vi.mock("@reactive-resume/db/client", () => ({ db: {} }));
vi.mock("./work", () => ({}));
vi.mock("./support", async (original) => ({
	...(await original<typeof import("./support")>()),
	submitSupportRequest: vi.fn(async () => ({ id: "case", status: "received" as const })),
}));
afterEach(() => vi.clearAllMocks());
const input = { subject: "other" as const, message: "Help with my account", requestNonce: "request" };
function client(user: { id: string; email: string; emailVerified: boolean } | null) {
	// The mocked procedure consumes user directly; retain the real router's required request context too.
	const context = { locale: "ar-SA" as const, user, reqHeaders: new Headers() };
	return createRouterClient(privacyRouter, { context });
}
const owner = { id: "alice", email: "alice@example.test", emailVerified: true };

it.each([undefined, "attacker@example.test", "invalid"])(
	"uses session email instead of client email %s",
	async (email) => {
		await client(owner).support({ ...input, ...(email === undefined ? {} : { email }) });
		expect(submitSupportRequest).toHaveBeenCalledWith({
			...input,
			locale: "ar-SA",
			email: "alice@example.test",
			authentication: { userId: "alice" },
		});
	},
);
it("requires a verified email for an authenticated account", async () => {
	await expect(
		client({ ...owner, emailVerified: false }).support({ ...input, email: "claim@example.test" }),
	).rejects.toThrow();
	expect(submitSupportRequest).not.toHaveBeenCalled();
});
it.each([undefined, "invalid"])("rejects signed-out email %s", async (email) => {
	await expect(client(null).support({ ...input, ...(email === undefined ? {} : { email }) })).rejects.toThrow();
	expect(submitSupportRequest).not.toHaveBeenCalled();
});
it("keeps a valid signed-out reply address", async () => {
	await client(null).support({ ...input, email: "reader@example.test" });
	expect(submitSupportRequest).toHaveBeenCalledWith({ ...input, locale: "ar-SA", email: "reader@example.test" });
});
