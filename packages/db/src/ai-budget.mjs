import { Pool } from "pg";

function assertLocalMigrationUrl(migrationUrl) {
	const url = new URL(migrationUrl);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.searchParams.has("host"))
		throw new Error("Local database required");
	return url;
}

function assertValidBudget(route, days) {
	if (
		!route ||
		typeof route.routeId !== "string" ||
		!route.routeId.trim() ||
		typeof route.routeRevision !== "string" ||
		!route.routeRevision.trim() ||
		!Number.isSafeInteger(route.requestCapMicros) ||
		route.requestCapMicros <= 0 ||
		!Number.isSafeInteger(route.dayCapMicros) ||
		route.dayCapMicros <= 0 ||
		route.requestCapMicros > route.dayCapMicros ||
		!Number.isSafeInteger(route.concurrency) ||
		route.concurrency < 1 ||
		route.concurrency > 100 ||
		!Number.isSafeInteger(days) ||
		days < 1
	)
		throw new Error("Invalid AI budget");
}

export async function ensureAiBudget(migrationUrl, route, days = 8) {
	const url = assertLocalMigrationUrl(migrationUrl);
	assertValidBudget(route, days);
	const pool = new Pool({ connectionString: url.toString() });
	let inserted = 0;
	try {
		const today = new Date();
		const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
		for (let offset = 0; offset < days; offset++) {
			const date = new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
			const result = await pool.query(
				`INSERT INTO ai_platform_budget
				 (id, route_id, route_revision, window_date, cap_micros, request_cap_micros, concurrency)
				 VALUES ($1, $2, $3, $4::date, $5, $6, $7)
				 ON CONFLICT (route_id, route_revision, window_date) DO NOTHING
				 RETURNING id`,
				[
					`${route.routeId}:${route.routeRevision}:${date}`,
					route.routeId,
					route.routeRevision,
					date,
					route.dayCapMicros,
					route.requestCapMicros,
					route.concurrency,
				],
			);
			inserted += result.rowCount ?? 0;
		}
	} catch {
		throw new Error("AI budget setup failed");
	} finally {
		await pool.end();
	}
	return inserted;
}
