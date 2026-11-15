import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(new URL("../../packages/db/package.json", import.meta.url));
const selectors = ["COVER_LETTER_TEST_DATABASE_URL", "INTEGRATIONS_TEST_DATABASE_URL", "OAUTH_TEST_DATABASE_URL"];

/** Refuse ambient/remote databases and libpq query overrides before connecting. */
export function validatePrivacyTestUrls(environment) {
	return selectors.map((key) => {
		if (!environment[key]) throw new Error(`An explicit ${key} is required`);
		const url = new URL(environment[key]);
		if (
			url.protocol !== "postgresql:" ||
			!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
			url.port !== "55432" ||
			url.username !== "postgres" ||
			url.password !== "postgres" ||
			url.search ||
			url.hash ||
			!/^\/[a-z][a-z0-9_]*$/.test(url.pathname)
		)
			throw new Error("Only the designated disposable database is allowed");
		return url.toString();
	});
}

export async function preparePrivacyTests(environment = process.env, dependencies = undefined) {
	const urls = validatePrivacyTestUrls(environment);
	const { Pool } = require("pg");
	const { drizzle } = require("drizzle-orm/node-postgres");
	const { migrate } = require("drizzle-orm/node-postgres/migrator");
	const connect =
		dependencies?.connect ??
		((connectionString) => new Pool({ connectionString, connectionTimeoutMillis: 5000, max: 1 }));
	const apply =
		dependencies?.migrate ??
		((pool) =>
			migrate(drizzle({ client: pool }), {
				migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)),
			}));
	for (const url of new Set(urls)) {
		const pool = connect(url);
		try {
			await pool.query("SELECT 1");
			await apply(pool);
		} finally {
			await pool.end();
		}
	}
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await preparePrivacyTests();
	console.info("Prepared explicitly selected disposable databases");
}
