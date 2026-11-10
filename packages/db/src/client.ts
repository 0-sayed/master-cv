import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@reactive-resume/env/server";

const requestDatabase = new AsyncLocalStorage<{ pool: Pool; database: ReturnType<typeof drizzle> }>();
type Database = ReturnType<typeof drizzle>;
export type OwnerTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const ownerDatabase = new AsyncLocalStorage<{
	userId: string;
	database: Database | OwnerTransaction;
	transaction: boolean;
}>();

function baseDatabase() {
	const database = requestDatabase.getStore()?.database ?? globalThis.__drizzle;
	if (!database) throw new Error("Database is not initialized");
	return database;
}

function checkOwner(userId: string) {
	if (!userId || userId.length > 255) throw new Error("Invalid database owner");
	const current = ownerDatabase.getStore();
	if (current && current.userId !== userId) throw new Error("Cannot change database owner within an active scope");
	return current;
}

/** One atomic unit of private work. Same-owner nesting uses the existing transaction. */
export async function withOwnerDatabase<T>(userId: string, work: (tx: OwnerTransaction) => Promise<T>): Promise<T> {
	return await ownerTransaction(userId, work);
}

async function ownerTransaction<T>(
	userId: string,
	work: (tx: OwnerTransaction) => Promise<T>,
	config?: Parameters<Database["transaction"]>[1],
): Promise<T> {
	const current = checkOwner(userId);
	if (current?.transaction) return work(current.database as OwnerTransaction);
	return await baseDatabase().transaction(async (tx) => {
		await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
		return ownerDatabase.run({ userId, database: tx, transaction: true }, () => work(tx));
	}, config);
}

/** Authenticated request scope; each standalone query gets a short transaction, never a network-call-sized one. */
export function withDatabaseOwner<T>(userId: string, work: () => T): T {
	if (checkOwner(userId)) return work();
	const pool = getPool();
	const scopedPool = new Proxy(pool, {
		get(target, property) {
			if (property === "query")
				return async (...args: unknown[]) => {
					const client = await target.connect();
					try {
						await client.query("BEGIN");
						await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
						const result = await Reflect.apply(client.query, client, args);
						await client.query("COMMIT");
						return result;
					} catch (error) {
						await client.query("ROLLBACK");
						throw error;
					} finally {
						client.release();
					}
				};
			const value: unknown = Reflect.get(target, property, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
	return ownerDatabase.run({ userId, database: drizzle({ client: scopedPool }), transaction: false }, work);
}

declare global {
	var __pool: Pool | undefined;
	var __drizzle: ReturnType<typeof drizzle> | undefined;
}

export function getPool() {
	const request = requestDatabase.getStore();
	if (request) return request.pool;
	if (!globalThis.__pool) {
		const pool = new Pool({
			connectionString: env.DATABASE_URL,
			max: env.DATABASE_POOL_MAX,
			connectionTimeoutMillis: 10_000,
			idleTimeoutMillis: 10_000,
		});
		const logPgError = (error: unknown) => {
			const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
			const safeCode =
				typeof code === "string" &&
				(/^[A-Z0-9]{5}$/.test(code) ||
					["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code))
					? code
					: "unknown";
			// pg may attach a whole client (including credentials) to the error object.
			console.error({ event: "postgres_connection_error", code: safeCode });
		};
		// A Postgres connection can drop at any time — e.g. a serverless Postgres such as Neon
		// terminating the connection (code 57P01). `pg` surfaces this as an 'error' event, and
		// without a listener node re-throws it as an unhandled 'error' that crashes the process.
		// Idle clients emit on the pool; a client that is connecting or checked out emits on the
		// client itself, so we must listen on both. The pool then discards the dead client and
		// opens a fresh one on the next query.
		pool.on("error", logPgError);
		pool.on("connect", (client) => {
			client.on("error", logPgError);
		});
		globalThis.__pool = pool;
	}
	return globalThis.__pool;
}

// ponytail: two private fns collapsed; getPool() is already a singleton, global cache preserved
globalThis.__drizzle ??= drizzle({ client: getPool() });

/** Workers must create sockets inside a request and cannot reuse them in another request. */
export function withDatabasePool<T>(pool: Pool, callback: () => T): T {
	return requestDatabase.run({ pool, database: drizzle({ client: pool }) }, callback);
}

export const db = new Proxy(globalThis.__drizzle, {
	get(target, property) {
		const owner = ownerDatabase.getStore();
		if (owner && !owner.transaction && property === "transaction") {
			return (work: (tx: OwnerTransaction) => Promise<unknown>, config?: Parameters<Database["transaction"]>[1]) =>
				ownerTransaction(owner.userId, work, config);
		}
		const database = owner?.database ?? requestDatabase.getStore()?.database ?? target;
		const value = Reflect.get(database, property, database) as unknown;
		return typeof value === "function" ? value.bind(database) : value;
	},
});

/** The client, or a transaction on it: helpers that write take either, so callers choose the transaction. */
export type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
