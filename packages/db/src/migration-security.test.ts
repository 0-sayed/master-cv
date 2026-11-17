import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

it("forces row security for every private table before runtime startup", () => {
	const directory = fileURLToPath(new URL("../../../migrations/", import.meta.url));
	const sql = readdirSync(directory)
		.sort()
		.map((name) => readFileSync(`${directory}/${name}/migration.sql`, "utf8"))
		.join("\n");
	const tables = Object.values(schema)
		.filter((value) => is(value, PgTable))
		.map((table) => getTableConfig(table))
		.filter((table) => table.enableRLS);
	for (const table of tables) {
		expect(sql, `${table.name} must force RLS`).toMatch(
			new RegExp(`ALTER TABLE ["']?${table.name}["']? FORCE ROW LEVEL SECURITY`, "iu"),
		);
	}
});
