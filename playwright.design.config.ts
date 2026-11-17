import { defineConfig } from "@playwright/test";
import config from "./playwright.config";
export default defineConfig({
	...config,
	testIgnore: [],
	testMatch: ["public-design.spec.ts", "personal-career-tools-design.spec.ts"],
	use: { ...config.use, headless: true },
});
