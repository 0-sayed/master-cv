import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { assertNoAiCredentials } from "./test-ai-guard.mjs";

export const isLoopbackAddress = (address: string) =>
	(isIP(address) === 4 && address.startsWith("127.")) || address === "::1";

async function requireLoopback(hostname: string) {
	const host = hostname.replace(/^\[|\]$/g, "");
	if (isLoopbackAddress(host)) return;
	if (host !== "localhost") throw new Error("DEMO_LOOPBACK_REQUIRED");
	let addresses;
	try {
		addresses = await lookup(host, { all: true, verbatim: true });
	} catch {
		throw new Error("DEMO_LOOPBACK_REQUIRED");
	}
	if (!addresses.length || addresses.some(({ address }) => !isLoopbackAddress(address)))
		throw new Error("DEMO_LOOPBACK_REQUIRED");
}

export async function assertDemoEnvironment(
	environment: NodeJS.ProcessEnv,
): Promise<{ databaseUrl: string; appUrl: string }> {
	if (environment.NODE_ENV === "production") throw new Error("DEMO_PRODUCTION_FORBIDDEN");
	if (environment.STORAGE_BACKEND && environment.STORAGE_BACKEND !== "local")
		throw new Error("DEMO_LOCAL_STORAGE_REQUIRED");
	if (Object.hasOwn(environment, "AI_API_KEY")) throw new Error("DEMO_INFERENCE_CREDENTIALS_FORBIDDEN");
	try {
		assertNoAiCredentials(environment);
	} catch {
		throw new Error("DEMO_INFERENCE_CREDENTIALS_FORBIDDEN");
	}
	if (!environment.DATABASE_URL) throw new Error("DEMO_RUNTIME_DATABASE_REQUIRED");
	if (!environment.APP_URL) throw new Error("DEMO_APP_URL_REQUIRED");
	let database: URL;
	let app: URL;
	try {
		database = new URL(environment.DATABASE_URL);
		app = new URL(environment.APP_URL);
	} catch {
		throw new Error("DEMO_INVALID_URL");
	}
	if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || database.pathname.length < 2)
		throw new Error("DEMO_INVALID_DATABASE_URL");
	if ([...database.searchParams.keys()].some((key) => key !== "sslmode") || database.hash)
		throw new Error("DEMO_DATABASE_OVERRIDE_FORBIDDEN");
	if (
		!["http:", "https:"].includes(app.protocol) ||
		app.username ||
		app.password ||
		app.search ||
		app.hash ||
		app.pathname !== "/"
	)
		throw new Error("DEMO_INVALID_APP_URL");
	await requireLoopback(database.hostname);
	await requireLoopback(app.hostname);
	return { databaseUrl: environment.DATABASE_URL, appUrl: app.origin };
}
