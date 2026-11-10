import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

async function loadConfig(overrides: Record<string, string> = {}) {
	for (const name of ["CI", "PORT", "APP_URL", "E2E_SMTP_PORT", "E2E_MAIL_DIRECTORY", "E2E_REUSE_SERVER"])
		vi.stubEnv(name, undefined);
	for (const [name, value] of Object.entries(overrides)) vi.stubEnv(name, value);
	// @boundaries-ignore root browser-test configuration
	const config = (await import("../playwright.config")).default;
	const servers = config.webServer;
	if (!Array.isArray(servers) || !servers[0] || !servers[1])
		throw new Error("Expected application and capture servers");
	return { ...config, capture: servers[0], application: servers[1] };
}

it("starts its own application and capture sink instead of silently reusing local services", async () => {
	const config = await loadConfig();
	expect(config.capture.reuseExistingServer).toBe(false);
	expect(config.application.reuseExistingServer).toBe(false);
});

it.each(["3000", "23100", "23200"])("shares an isolated SMTP port derived from web port %s", async (port) => {
	const config = await loadConfig({ PORT: port });
	const expected = Number(port) + 3;
	expect(config.capture.port).toBe(expected);
	expect(config.capture.env?.E2E_SMTP_PORT).toBe(String(expected));
	expect(config.application.env?.SMTP_PORT).toBe(String(expected));
});

it("reuses an explicitly provisioned application and capture pair without changing its capture directory", async () => {
	const config = await loadConfig({
		E2E_REUSE_SERVER: "true",
		E2E_SMTP_PORT: "2526",
		E2E_MAIL_DIRECTORY: ".synthetic-runtime/mail",
		PLAYWRIGHT_CHANNEL: "chrome",
	});
	expect(config.capture.port).toBe(2526);
	expect(config.capture.reuseExistingServer).toBe(true);
	expect(config.capture.env?.E2E_SMTP_PORT).toBe("2526");
	expect(config.capture.env?.E2E_MAIL_DIRECTORY).toBe(".synthetic-runtime/mail");
	expect(config.application.reuseExistingServer).toBe(true);
	expect(config.application.env?.SMTP_PORT).toBe("2526");
	expect(config.projects?.[0]?.use?.channel).toBe("chrome");
});

it.each([{ E2E_MAIL_DIRECTORY: ".synthetic-runtime/mail" }, { E2E_SMTP_PORT: "2526" }, {}])(
	"requires an explicit capture port and directory before allowing reuse: %j",
	async (overrides) => {
		let message = "No validation error";
		try {
			await loadConfig({ E2E_REUSE_SERVER: "true", ...overrides });
		} catch (error) {
			message = error instanceof Error ? error.message : "Unexpected error";
		}
		expect(message).toBe("E2E_REUSE_SERVER requires E2E_SMTP_PORT and E2E_MAIL_DIRECTORY");
	},
);
