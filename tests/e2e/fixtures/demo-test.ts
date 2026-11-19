import type { PoolClient } from "pg";
import { Pool } from "pg";
import { disposableDatabaseUrl } from "./privacy";
import { test as base } from "./test";

// Demo seeds share one account, so a reset must not interrupt another demo test.
export const test = base.extend<{ demoLock: () => Promise<void> }>({
	demoLock: async ({ baseURL: _baseURL }, runFixture) => {
		let pool: Pool | undefined;
		let client: PoolClient | undefined;
		try {
			await runFixture(async () => {
				pool = new Pool({ connectionString: disposableDatabaseUrl() });
				client = await pool.connect();
				await client.query("SELECT pg_advisory_lock(hashtext('browser-demo-workspace'))");
			});
		} finally {
			if (client) {
				await client.query("SELECT pg_advisory_unlock(hashtext('browser-demo-workspace'))");
				client.release();
			}
			await pool?.end();
		}
	},
});

export { expect } from "./test";
