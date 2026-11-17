import { defineConfig, devices } from "@playwright/test";

// Attach without starting a server. Tests register disposable accounts through the shared auth fixture.
if (process.env.E2E_STORAGE_STATE) throw new Error("Live tests cannot reuse owner storage state.");
export default defineConfig({
	testDir: "./tests/e2e/live",
	testMatch: "application-back-navigation.spec.ts",
	workers: 1,
	retries: 0,
	timeout: 90_000,
	expect: { timeout: 15_000 },
	reporter: [["list"]],
	use: {
		...devices["Desktop Chrome"],
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
		baseURL: "http://localhost:3030",
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
});
