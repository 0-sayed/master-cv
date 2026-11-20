import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ calls: [], existing: false, fail: false }));
vi.mock("pg", () => ({
	Pool: class {
		constructor(options) {
			state.connectionString = options.connectionString;
		}
		async query(sql, values) {
			state.calls.push([sql, values]);
			if (state.fail && sql === "COMMIT") throw new Error("commit failed");
			if (sql.includes("SELECT 1 FROM pg_roles")) return { rowCount: Number(state.existing) };
			if (sql === "SELECT current_database() AS name, current_user AS owner")
				return { rows: [{ name: "sirawise", owner: "sirawise" }] };
			return { rowCount: 0 };
		}
		async end() {
			state.ended = true;
		}
	},
}));

const { syncRuntimeRole } = await import("./runtime-role.mjs");

function reset() {
	state.calls = [];
	state.existing = false;
	state.fail = false;
	state.ended = false;
}

it("creates a restricted role and grants current and future migration tables in one transaction", async () => {
	reset();
	await syncRuntimeRole("postgresql://sirawise:owner@127.0.0.1/sirawise", "sirawise_runtime", "a'password");
	const sql = state.calls.map(([statement]) => statement);
	expect(sql[0]).toBe("BEGIN");
	expect(
		sql.some((statement) =>
			statement.includes(
				"CREATE ROLE \"sirawise_runtime\" LOGIN PASSWORD 'a''password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT",
			),
		),
	).toBe(true);
	expect(
		sql.some((statement) => statement.includes("ALTER DEFAULT PRIVILEGES") && statement.includes("ON TABLES")),
	).toBe(true);
	expect(sql.at(-1)).toBe("COMMIT");
	expect(state.ended).toBe(true);
});

it("does not change an existing role password and keeps grants repeatable", async () => {
	reset();
	state.existing = true;
	await syncRuntimeRole("postgresql://sirawise:owner@localhost/sirawise", "sirawise_runtime", "unused");
	expect(state.calls.some(([statement]) => statement.startsWith("CREATE ROLE"))).toBe(false);
	expect(
		state.calls.some(([statement]) => statement.startsWith("GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES")),
	).toBe(true);
});

it.each([
	["postgresql://sirawise:owner@postgres/sirawise", "sirawise_runtime", "secret", "Local database required"],
	[
		"postgresql://sirawise:owner@127.0.0.1/sirawise?host=remote",
		"sirawise_runtime",
		"secret",
		"Local database required",
	],
	["postgresql://sirawise:owner@127.0.0.1/sirawise", "Bad-Role", "secret", "Invalid runtime role name"],
	["postgresql://sirawise:owner@127.0.0.1/sirawise", "sirawise_runtime", "", "Runtime database password is required"],
])("rejects unsafe role-sync input", async (url, role, password, message) => {
	reset();
	await expect(syncRuntimeRole(url, role, password)).rejects.toThrow(message);
	expect(state.calls).toHaveLength(0);
});

it("rolls back grant changes when the transaction fails", async () => {
	reset();
	state.fail = true;
	await expect(
		syncRuntimeRole("postgresql://sirawise:owner@127.0.0.1/sirawise", "sirawise_runtime", "secret"),
	).rejects.toThrow("commit failed");
	expect(state.calls.at(-1)?.[0]).toBe("ROLLBACK");
	expect(state.ended).toBe(true);
});
