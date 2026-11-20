import { isIP } from "node:net";
import { z } from "zod";
import { demoCredentials } from "./demo-credentials";

/** Separate authorization: the local seed must continue to reject production. */
export function assertProductionDemoEnvironment(environment: NodeJS.ProcessEnv) {
	if (environment.NODE_ENV !== "production") throw new Error("DEMO_PRODUCTION_REQUIRED");
	const email = environment.DEMO_ACCOUNT_EMAIL;
	if (
		!email ||
		!z.email().safeParse(email).success ||
		email !== email.trim().toLowerCase() ||
		email === demoCredentials.email
	)
		throw new Error("DEMO_DEDICATED_EMAIL_REQUIRED");
	const password = environment.DEMO_ACCOUNT_PASSWORD;
	if (!password || password.trim().length < 16 || password.trim() === demoCredentials.password)
		throw new Error("DEMO_PRIVATE_PASSWORD_REQUIRED");
	if (environment.DEMO_PRODUCTION_CONFIRM !== email) throw new Error("DEMO_PRODUCTION_CONFIRM_REQUIRED");
	if (!environment.ADMIN_EMAILS?.split(",").some((value) => value.trim().toLowerCase() === email))
		throw new Error("DEMO_AI_ALLOWLIST_REQUIRED");
	if (environment.PERSONAL_CAREER_TOOLS_RELEASE_APPROVED !== "true")
		throw new Error("DEMO_PERSONAL_TOOLS_APPROVAL_REQUIRED");
	if (environment.STORAGE_BACKEND !== "local") throw new Error("DEMO_LOCAL_STORAGE_REQUIRED");
	if (!environment.DATABASE_URL || !environment.APP_URL) throw new Error("DEMO_URLS_REQUIRED");
	let database: URL;
	let app: URL;
	try {
		database = new URL(environment.DATABASE_URL);
		app = new URL(environment.APP_URL);
	} catch {
		throw new Error("DEMO_INVALID_URL");
	}
	const host = database.hostname.replace(/^\[|\]$/g, "");
	const loopback = (isIP(host) === 4 && host.startsWith("127.")) || host === "::1";
	if (
		!["postgres:", "postgresql:"].includes(database.protocol) ||
		database.pathname.length < 2 ||
		(!loopback && host !== "postgres")
	)
		throw new Error("DEMO_DATABASE_DESTINATION_FORBIDDEN");
	if ([...database.searchParams.keys()].some((key) => key !== "sslmode") || database.hash)
		throw new Error("DEMO_DATABASE_OVERRIDE_FORBIDDEN");
	if (app.protocol !== "https:" || app.username || app.password || app.search || app.hash || app.pathname !== "/")
		throw new Error("DEMO_INVALID_APP_URL");
	return { email, password, databaseUrl: environment.DATABASE_URL, appUrl: app.origin };
}
