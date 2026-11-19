import { lookup } from "node:dns/promises";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ensureLocalAiBudget } from "./real-ai-budget";

const database = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn(), connect: vi.fn() }));
vi.mock("pg", () => ({
	Pool: class {
		constructor(options: unknown) {
			database.connect(options);
		}
		query = database.query;
		end = database.end;
	},
}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
const environment = {
	NODE_ENV: "development",
	DATABASE_URL: "postgresql://runtime:fake@127.0.0.1:25532/sample",
	DATABASE_MIGRATION_URL: "postgresql://owner:fake@127.0.0.1:25532/sample",
};
const route = {
	routeId: "local-real-ai",
	routeRevision: "provisional-1",
	dayCapMicros: 3000000,
	requestCapMicros: 200000,
};
afterEach(() => vi.resetAllMocks());

it("creates only a missing UTC budget and preserves all existing limits, spend, and reservations", async () => {
	database.query.mockResolvedValue({ rowCount: 1 });
	await ensureLocalAiBudget(environment, route);
	database.query.mockResolvedValue({ rowCount: 0 });
	await ensureLocalAiBudget(environment, route);
	for (const [sql, values] of database.query.mock.calls) {
		expect(sql).toMatch(/CURRENT_TIMESTAMP AT TIME ZONE 'UTC'/);
		expect(sql).toMatch(/ON CONFLICT \(route_id, route_revision, window_date\) DO NOTHING/);
		expect(sql).not.toMatch(/UPDATE|DELETE|TRUNCATE/);
		expect(values).toEqual(["local-real-ai", "provisional-1", 3000000, 200000, 2]);
	}
	expect(database.end).toHaveBeenCalledTimes(2);
});

it.each([
	{ NODE_ENV: "production" },
	{ DATABASE_MIGRATION_URL: undefined },
	{ DATABASE_MIGRATION_URL: "postgresql://owner:secret@remote.invalid/sample" },
	{ DATABASE_URL: "postgresql://runtime:secret@remote.invalid/sample" },
	{ DATABASE_MIGRATION_URL: "postgresql://owner:secret@127.0.0.1:25532/other" },
	{ DATABASE_MIGRATION_URL: "postgresql://owner:secret@127.0.0.1:25533/sample" },
	{ DATABASE_MIGRATION_URL: environment.DATABASE_MIGRATION_URL + "?host=remote.invalid" },
	{ DATABASE_MIGRATION_URL: environment.DATABASE_MIGRATION_URL + "?options=-c%20role=postgres" },
	{ DATABASE_MIGRATION_URL: "https://127.0.0.1/sample" },
])("refuses unsafe provisioning before opening a connection", async (patch) => {
	await expect(ensureLocalAiBudget({ ...environment, ...patch }, route)).rejects.toThrow(/^LOCAL_REAL_AI_[A-Z_]+$/);
	expect(database.connect).not.toHaveBeenCalled();
});

it("rejects localhost when any resolved address is remote", async () => {
	vi.mocked(lookup).mockResolvedValue([{ address: "192.0.2.1", family: 4 }] as never);
	await expect(
		ensureLocalAiBudget(
			{ ...environment, DATABASE_MIGRATION_URL: "postgresql://owner:fake@localhost:25532/sample" },
			route,
		),
	).rejects.toThrow("LOCAL_REAL_AI_LOCAL_DATABASE_REQUIRED");
	expect(database.connect).not.toHaveBeenCalled();
});

it("pins a verified localhost address before opening the administrative connection", async () => {
	vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
	await ensureLocalAiBudget(
		{ ...environment, DATABASE_MIGRATION_URL: "postgresql://owner:fake@localhost:25532/sample" },
		route,
	);
	expect(database.connect).toHaveBeenCalledWith(
		expect.objectContaining({
			connectionString: environment.DATABASE_MIGRATION_URL,
		}),
	);
});

it.each([{ dayCapMicros: 3000001 }, { requestCapMicros: 200001 }, { dayCapMicros: 0 }, { routeId: "production" }])(
	"refuses budget values outside the bounded local route",
	async (patch) => {
		await expect(ensureLocalAiBudget(environment, { ...route, ...patch })).rejects.toThrow(
			"LOCAL_REAL_AI_INVALID_BUDGET",
		);
		expect(database.connect).not.toHaveBeenCalled();
	},
);

it("closes the administrative connection when provisioning fails", async () => {
	database.query.mockRejectedValue(new Error("Synthetic failure"));
	await expect(ensureLocalAiBudget(environment, route)).rejects.toThrow("LOCAL_REAL_AI_BUDGET_SETUP_FAILED");
	expect(database.end).toHaveBeenCalledOnce();
});
