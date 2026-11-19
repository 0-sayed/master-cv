import type { ApprovedRoute } from "@reactive-resume/api/features/ai/route-policy";
import { lookup } from "node:dns/promises";
import { Pool } from "pg";

async function localDatabase(value: string | undefined) {
	let url: URL;
	try {
		url = new URL(value ?? "");
	} catch {
		throw new Error("LOCAL_REAL_AI_LOCAL_DATABASE_REQUIRED");
	}
	if (
		!["postgres:", "postgresql:"].includes(url.protocol) ||
		!["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
		url.pathname.length < 2 ||
		url.hash ||
		[...url.searchParams.keys()].some((key) => key !== "sslmode")
	)
		throw new Error("LOCAL_REAL_AI_LOCAL_DATABASE_REQUIRED");
	if (url.hostname === "localhost") {
		const addresses = await lookup("localhost", { all: true, verbatim: true });
		const first = addresses[0];
		if (!first || addresses.some(({ address }) => !["127.0.0.1", "::1"].includes(address)))
			throw new Error("LOCAL_REAL_AI_LOCAL_DATABASE_REQUIRED");
		// Pin the address that passed the loopback guard, rather than resolving it again in pg.
		url.hostname = first.address === "::1" ? "[::1]" : "127.0.0.1";
	}
	return url;
}

/** Local administrative setup only. Runtime roles retain no budget-table privileges. */
export async function ensureLocalAiBudget(
	environment: Record<string, string | undefined>,
	route: Pick<ApprovedRoute, "routeId" | "routeRevision" | "dayCapMicros" | "requestCapMicros">,
) {
	if (environment.NODE_ENV === "production") throw new Error("LOCAL_REAL_AI_DEV_ONLY");
	const runtime = await localDatabase(environment.DATABASE_URL);
	const admin = await localDatabase(environment.DATABASE_MIGRATION_URL);
	if ((runtime.port || "5432") !== (admin.port || "5432") || runtime.pathname !== admin.pathname)
		throw new Error("LOCAL_REAL_AI_DATABASE_MISMATCH");
	if (
		route.routeId !== "local-real-ai" ||
		!Number.isSafeInteger(route.dayCapMicros) ||
		route.dayCapMicros <= 0 ||
		route.dayCapMicros > 3000000 ||
		!Number.isSafeInteger(route.requestCapMicros) ||
		route.requestCapMicros <= 0 ||
		route.requestCapMicros > Math.min(route.dayCapMicros, 200000)
	)
		throw new Error("LOCAL_REAL_AI_INVALID_BUDGET");
	const pool = new Pool({ connectionString: admin.toString(), max: 1, connectionTimeoutMillis: 10000 });
	try {
		await pool.query(
			`INSERT INTO ai_platform_budget
			 (id, route_id, route_revision, window_date, cap_micros, request_cap_micros, concurrency)
			 SELECT $1 || ':' || $2 || ':' || day::text, $1, $2, day, $3, $4, $5
			 FROM (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AS day) AS budget_window
			 ON CONFLICT (route_id, route_revision, window_date) DO NOTHING`,
			[route.routeId, route.routeRevision, route.dayCapMicros, route.requestCapMicros, 2],
		);
	} catch {
		// pg errors can contain administrative credentials. Keep startup output safe.
		throw new Error("LOCAL_REAL_AI_BUDGET_SETUP_FAILED");
	} finally {
		await pool.end();
	}
}
