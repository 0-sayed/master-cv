import { afterEach, expect, it, vi } from "vite-plus/test";
import { deploymentEnvironment } from "./deployment";

vi.mock("@reactive-resume/utils/monorepo.node", () => ({ findWorkspaceRoot: () => null }));
afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

it("uses the approved sender without changing an explicitly supplied origin", async () => {
	vi.stubEnv("SMTP_FROM", undefined);
	vi.stubEnv("APP_URL", "http://127.0.0.1:23100");
	const { env } = await import("./server");
	expect(env.SMTP_FROM).toBe("Sirawise <noreply@sirawise.io>");
	expect(env.APP_URL).toBe("http://127.0.0.1:23100");
});

it("preserves an explicit sender override", async () => {
	vi.stubEnv("SMTP_FROM", "Local Preview <preview@example.test>");
	expect((await import("./server")).env.SMTP_FROM).toBe("Local Preview <preview@example.test>");
});

it("uses the supplied Cloudron address and an overridable display name", () => {
	expect(deploymentEnvironment({ CLOUDRON: "1", CLOUDRON_MAIL_FROM: "mail@example.test" }).SMTP_FROM).toBe(
		"Sirawise <mail@example.test>",
	);
	expect(
		deploymentEnvironment({
			CLOUDRON: "1",
			CLOUDRON_MAIL_FROM: "mail@example.test",
			CLOUDRON_MAIL_FROM_DISPLAY_NAME: "Private Preview",
		}).SMTP_FROM,
	).toBe("Private Preview <mail@example.test>");
});
