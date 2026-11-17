import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

if (!base.webServer) throw new Error("Expected browser web servers");
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer];
export default defineConfig({
	...base,
	testDir: resolve(process.cwd(), "tests/e2e/specs"),
	testIgnore: [],
	testMatch: "**/personal-tools-availability.spec.ts",
	webServer: servers.map((server) => ({
		...server,
		cwd: process.cwd(),
		env: { ...server.env, PERSONAL_CAREER_TOOLS_RELEASE_APPROVED: "false" },
	})),
});
