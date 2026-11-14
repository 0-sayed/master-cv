import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { provisionRuntimeRole } from "./database-roles.mjs";
import { assertNoAiCredentials } from "./test-ai-guard.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const { Pool } = createRequire(new URL("../../packages/db/package.json", import.meta.url))("pg");

/** Allowlist the browser CI environment; personal .env/browser settings must never alter the contract. */
export function ciBrowserEnvironment({ parent, databaseUrl, migrationUrl, directory }) {
	assertNoAiCredentials(parent);
	return {
		PATH: resolve(repository, ".cache/document-toolchain/bin") + ":" + parent.PATH,
		HOME: parent.HOME,
		NODE_OPTIONS: `--import=${new URL("./test-isolation.mjs", import.meta.url).href}`,
		TEST_INFERENCE_ISOLATION: "true",
		// Match GitHub Ubuntu: Chromium must encode Arabic download filenames as UTF-8.
		LANG: "C.UTF-8",
		LC_ALL: "C.UTF-8",
		CI: "true",
		APP_URL: "http://localhost:3030",
		PORT: "3030",
		DATABASE_URL: databaseUrl,
		DATABASE_MIGRATION_URL: migrationUrl,
		AUTH_SECRET: randomBytes(32).toString("hex"),
		ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
		FLAG_DISABLE_SIGNUPS: "false",
		FLAG_DISABLE_EMAIL_AUTH: "false",
		FLAG_ENABLE_GUEST_LOGIN: "false",
		FLAG_DISABLE_API_RATE_LIMIT: "true",
		FLAG_ALLOW_UNSAFE_AI_BASE_URL: "true",
		STORAGE_BACKEND: "local",
		LOCAL_STORAGE_PATH: resolve(directory, "storage"),
		E2E_MAIL_DIRECTORY: resolve(directory, "mail"),
		E2E_SMTP_PORT: "3033",
		DOCUMENT_TOOLCHAIN_DIRECTORY: resolve(repository, ".cache/document-toolchain"),
	};
}

async function requireFreePort(port) {
	await new Promise((accept, reject) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		socket.once("connect", () => {
			socket.destroy();
			reject(new Error(`Port ${port} is occupied; stop only your own test runtime before running CI browsers.`));
		});
		socket.once("error", (error) => (error.code === "ECONNREFUSED" ? accept() : reject(error)));
	});
}

async function main() {
	const adminUrl = process.env.E2E_DATABASE_ADMIN_URL;
	if (!adminUrl) throw new Error("E2E_DATABASE_ADMIN_URL must name a local synthetic PostgreSQL admin connection.");
	const url = new URL(adminUrl);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host"))
		throw new Error("Local database required");
	await requireFreePort(3030);
	await requireFreePort(3033);
	const directory = await mkdtemp(resolve(tmpdir(), "master-cv-ci-browser-"));
	const id = `${Date.now()}_${randomBytes(3).toString("hex")}`;
	const database = `ci_browser_${id}`;
	const role = `ci_browser_runtime_${id}`;
	url.pathname = "/" + database;
	const migrationUrl = url.toString();
	const env = ciBrowserEnvironment({ parent: process.env, databaseUrl: migrationUrl, migrationUrl, directory });
	const redact = (line) =>
		[adminUrl, migrationUrl, env.DATABASE_URL, env.AUTH_SECRET, env.ENCRYPTION_SECRET].reduce(
			(text, value) => text.replaceAll(value, "[REDACTED]"),
			line,
		);
	const run = (args) =>
		new Promise((accept, reject) => {
			const child = spawn("pnpm", ["--config.verifyDepsBeforeRun=false", ...args], { cwd: repository, env });
			const interrupt = () => child.kill("SIGINT");
			process.once("SIGINT", interrupt);
			process.once("SIGTERM", interrupt);
			for (const [source, target] of [
				[child.stdout, process.stdout],
				[child.stderr, process.stderr],
			]) {
				let pending = "";
				source.on("data", (chunk) => {
					pending += chunk.toString();
					const lines = pending.split("\n");
					pending = lines.pop();
					for (const line of lines) target.write(redact(line) + "\n");
				});
				source.on("end", () => {
					if (pending) target.write(redact(pending));
				});
			}
			child.once("error", reject);
			child.once("exit", (code) => {
				process.removeListener("SIGINT", interrupt);
				process.removeListener("SIGTERM", interrupt);
				accept(code ?? 1);
			});
		});
	const pool = new Pool({ connectionString: adminUrl, max: 1 });
	try {
		await pool.query(`CREATE DATABASE "${database}"`);
	} finally {
		await pool.end();
	}
	console.info(`Fresh synthetic database: ${database}; restricted role: ${role}; artifacts: ${directory}`);
	await mkdir(env.LOCAL_STORAGE_PATH, { recursive: true, mode: 0o700 });
	if (await run(["--filter", "@reactive-resume/db", "db:migrate"])) throw new Error("CI database migration failed");
	env.DATABASE_URL = await provisionRuntimeRole(migrationUrl, role);
	const args = process.argv.slice(2);
	const skipBuild = args.includes("--skip-build");
	if (!skipBuild) {
		// Avoid Turbo's .env* input hashing: sanitized synthetic builds must not read local environment files.
		if (
			(await run(["pdf:translations"])) ||
			(await run(["--recursive", "--workspace-concurrency=1", "--if-present", "run", "build"]))
		)
			throw new Error("Production build failed");
	}
	process.exitCode = await run([
		"exec",
		"playwright",
		"test",
		...args.filter((arg) => arg !== "--skip-build"),
		"--output",
		resolve(directory, "browser"),
	]);
	await copyFile(resolve(repository, "test-results/e2e-junit.xml"), resolve(directory, "junit.xml"));
	// Retain only this new synthetic database/storage for failure investigation; never reuse it on the next run.
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : "CI browser runner failed");
		process.exitCode = 1;
	});
}
