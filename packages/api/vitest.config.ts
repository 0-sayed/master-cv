import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite-plus";
// @boundaries-ignore root shared Vitest config
import { createVitestProjectConfig } from "../../vitest.shared.mts";

export default mergeConfig(
	createVitestProjectConfig({
		name: "@reactive-resume/api",
		dirname: fileURLToPath(new URL(".", import.meta.url)),
	}),
	{
		test: {
			// Account fixtures and WebAuthn responses use this synthetic origin. Never inherit host credentials.
			env: {
				APP_URL: "http://localhost:3030",
				AUTH_SECRET: "synthetic-api-test-auth-secret",
				ENCRYPTION_SECRET: "0".repeat(32),
			},
		},
	},
);
