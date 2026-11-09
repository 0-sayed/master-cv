import { defineConfig, devices } from "@playwright/test";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const baseURL = process.env.APP_URL ?? `http://localhost:${port}`;
const isCI = process.env.CI === "true" || process.env.CI === "1";
const reuseExistingServer = process.env.E2E_REUSE_SERVER === "true";
if (reuseExistingServer && (!process.env.E2E_SMTP_PORT || !process.env.E2E_MAIL_DIRECTORY))
	throw new Error("E2E_REUSE_SERVER requires E2E_SMTP_PORT and E2E_MAIL_DIRECTORY");
const smtpPort = process.env.E2E_SMTP_PORT ?? String(port + 3);

export default defineConfig({
	testDir: "./tests/e2e/specs",
	fullyParallel: true,
	forbidOnly: isCI,
	retries: 0,
	...(isCI ? { workers: 1 } : {}),
	timeout: 30_000,
	expect: {
		timeout: 10_000,
	},
	reporter: isCI
		? [["list"], ["github"], ["junit", { outputFile: "test-results/e2e-junit.xml" }]]
		: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
			},
		},
	],
	webServer: [
		{
			command: "node tests/e2e/mail-capture.mjs",
			port: Number(smtpPort),
			reuseExistingServer,
			env: { E2E_SMTP_PORT: smtpPort, E2E_MAIL_DIRECTORY: process.env.E2E_MAIL_DIRECTORY ?? "test-results/mail" },
		},
		{
			// Run node directly: pnpm >=12.6 moves script children into their own process group,
			// so Playwright's group kill misses the server and the job hangs after the tests finish.
			command: "node apps/server/dist/index.mjs",
			url: `${baseURL}/api/health`,
			reuseExistingServer,
			timeout: 120_000,
			env: {
				...process.env,
				APP_URL: baseURL,
				NODE_ENV: "production",
				PORT: String(port),
				SMTP_HOST: "127.0.0.1",
				SMTP_PORT: smtpPort,
				SMTP_SECURE: "false",
				SMTP_USER: "synthetic",
				SMTP_PASS: "synthetic",
				SMTP_FROM: "Master CV <mail@example.test>",
			},
		},
	],
});
