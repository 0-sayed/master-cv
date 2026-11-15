import { writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { provisionRuntimeRole } from "@reactive-resume/db/runtime-role";

export { provisionRuntimeRole };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (existsSync(".env.runtime.local")) throw new Error("Preserving existing .env.runtime.local; no role created");
	if (!process.env.DATABASE_MIGRATION_URL)
		throw new Error("DATABASE_MIGRATION_URL must select a local synthetic database");
	const runtimeUrl = await provisionRuntimeRole(process.env.DATABASE_MIGRATION_URL);
	writeFileSync(
		".env.runtime.local",
		`DATABASE_URL=${runtimeUrl}\nDATABASE_MIGRATION_URL=${process.env.DATABASE_MIGRATION_URL}\n`,
		{ mode: 0o600, flag: "wx" },
	);
	console.info("Created restricted local role; private configuration written to .env.runtime.local");
}
