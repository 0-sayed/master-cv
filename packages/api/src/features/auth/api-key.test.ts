// Exercise retained internals without changing the production release policy.
vi.mock("@reactive-resume/schema/personal-tools", async (original) => ({
	...(await original<typeof import("@reactive-resume/schema/personal-tools")>()),
	isFeatureAvailable: (feature: string) => ["userApi"].includes(feature),
}));
import { expect, it, vi } from "vite-plus/test";
import { createProcedureClient } from "@orpc/server";

const createApiKey = vi.hoisted(() => vi.fn());
vi.mock("@reactive-resume/auth/config", () => ({ auth: { api: { createApiKey } } }));
vi.mock("./service", () => ({ authService: {} }));
const { authRouter } = await import("./router");

it.each(["apiKey", "bearer", "session"] as const)(
	"requires a browser session to issue credentials: %s",
	async (method) => {
		createApiKey.mockReset().mockResolvedValue({ key: "issued-key" });
		const issue = createProcedureClient(authRouter.createApiKey, {
			context: {
				locale: "en-US",
				reqHeaders: new Headers(),
				authentication: {
					user: {
						id: "owner",
						name: "Owner",
						email: "owner@example.test",
						emailVerified: true,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					method,
					permissions: ["read", "write", "delete"],
				},
			},
		});
		const input = { name: "Read only", access: "read" as const, expiresIn: 86400 };
		if (method === "session") {
			await expect(issue(input)).resolves.toEqual({ key: "issued-key" });
			expect(createApiKey).toHaveBeenCalledWith({
				body: { userId: "owner", name: "Read only", expiresIn: 86400, permissions: { api: ["read"] } },
			});
		} else {
			await expect(issue(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(createApiKey).not.toHaveBeenCalled();
		}
	},
);
