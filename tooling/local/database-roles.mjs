import { appendFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { provisionRuntimeRole } from "@reactive-resume/db/runtime-role";

export { provisionRuntimeRole };

export function assertGitHubContext(environment) {
	if (environment.GITHUB_ACTIONS !== "true") throw new Error("GitHub Actions required for --github-env");
	if (!environment.GITHUB_ENV) throw new Error("GITHUB_ENV is required for --github-env");
}

export function writeRuntimeConfiguration({ runtimeUrl, migrationUrl, githubEnv }) {
	if (githubEnv) {
		console.info(`::add-mask::${runtimeUrl}`);
		appendFileSync(githubEnv, `DATABASE_URL=${runtimeUrl}\n`);
		return;
	}
	if (existsSync(".env.runtime.local")) throw new Error("Preserving existing .env.runtime.local; no role created");
	writeFileSync(".env.runtime.local", `DATABASE_URL=${runtimeUrl}\nDATABASE_MIGRATION_URL=${migrationUrl}\n`, {
		mode: 0o600,
		flag: "wx",
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const github = process.argv.includes("--github-env");
	if (github) assertGitHubContext(process.env);
	if (!github && existsSync(".env.runtime.local"))
		throw new Error("Preserving existing .env.runtime.local; no role created");
	if (!process.env.DATABASE_MIGRATION_URL)
		throw new Error("DATABASE_MIGRATION_URL must select a local synthetic database");
	const runtimeUrl = await provisionRuntimeRole(process.env.DATABASE_MIGRATION_URL);
	writeRuntimeConfiguration({
		runtimeUrl,
		migrationUrl: process.env.DATABASE_MIGRATION_URL,
		githubEnv: github ? process.env.GITHUB_ENV : undefined,
	});
	console.info(
		github
			? "Created restricted synthetic runtime role for GitHub"
			: "Created restricted local role; private configuration written to .env.runtime.local",
	);
}
