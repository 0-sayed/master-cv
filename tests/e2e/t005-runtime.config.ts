import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

if (!base.webServer) throw new Error("Expected the browser web servers");
const servers = Array.isArray(base.webServer) ? base.webServer : [base.webServer];
export default defineConfig({
	...base,
	testDir: resolve(process.cwd(), "tests/e2e/t005-runtime"),
	webServer: servers.map((server, index) =>
		index === 1 && server
			? {
					...server,
					cwd: process.cwd(),
					command: "node --import ./apps/server/node_modules/tsx/dist/loader.mjs tests/e2e/t005-runtime-server.ts",
				}
			: { ...server, cwd: process.cwd() },
	),
});
