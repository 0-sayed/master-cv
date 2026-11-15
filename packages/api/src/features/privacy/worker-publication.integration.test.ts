import { expect, it } from "vite-plus/test";
import { requestAccountDeletion } from "./deletion";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
import { seedPersonalData } from "./testing/personal-data";
const database = privacyTestDatabase();
it.each([
	{ owner: "alice" as const, table: "career_artifact", column: "data" },
	{ owner: "bob" as const, table: "agent_messages", column: "ui_message" },
])(
	"deletion fences a held $table result at the restricted database publication boundary",
	async ({ owner, table, column }) => {
		await seedPersonalData(database.admin(), owner);
		await database.admin().query("DELETE FROM passkey WHERE user_id=$1", [owner]);
		const statement = `UPDATE ${table} SET ${column}=$1 WHERE user_id=$2 RETURNING id`;
		const before = (await database.admin().query(`SELECT ${column} AS value FROM ${table} WHERE user_id=$1`, [owner]))
			.rows[0].value;
		expect((await database.queryAs(owner, statement, [before, owner])).rowCount).toBeGreaterThan(0);
		const response = Promise.withResolvers<object>();
		const pending = response.promise
			.then((result) => database.queryAs(owner, statement, [result, owner]))
			.then(
				() => null,
				(error) => error,
			);
		const session = await syntheticAccountSession(database, owner);
		await database.run(async () =>
			requestAccountDeletion({ headers: session.headers, ...(await session.proof("delete_account")), confirmed: true }),
		);
		response.resolve({ syntheticLateOutput: "must not be published" });
		expect(await pending).toMatchObject({ message: "ACCOUNT_DELETION_PENDING" });
		expect(
			(await database.admin().query(`SELECT ${column} AS value FROM ${table} WHERE user_id=$1`, [owner])).rows[0].value,
		).toEqual(before);
	},
);
