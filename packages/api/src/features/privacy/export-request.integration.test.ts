import { expect, it } from "vite-plus/test";
import { getAccountExport, downloadAccountExport } from "./delivery";
import { requestAccountExport } from "./export";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
it("export requests require action-bound proof consumed in their enqueue transaction", async () => {
	const session = await syntheticAccountSession(database);
	const wrong = await session.proof("delete_account");
	await expect(database.run(() => requestAccountExport({ ...wrong, headers: session.headers }))).rejects.toThrow(
		"PROOF_EXPIRED_OR_INVALID",
	);
	const proof = await session.proof("export_account");
	const results = await Promise.allSettled(
		[1, 2].map(() => database.run(() => requestAccountExport({ ...proof, headers: session.headers }))),
	);
	expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
	expect((await database.admin().query("SELECT id FROM account_data_export")).rowCount).toBe(1);
	expect((await database.admin().query("SELECT id FROM privacy_work WHERE kind='export_account'")).rowCount).toBe(1);
});
it("poll and download require a current same-owner browser session", async () => {
	const bob = await syntheticAccountSession(database, "bob");
	const id = (await database.admin().query("SELECT id FROM account_data_export")).rows[0].id;
	await expect(database.run(() => getAccountExport({ headers: bob.headers, id }))).rejects.toThrow(
		"EXPORT_UNAVAILABLE",
	);
	await expect(database.run(() => downloadAccountExport({ headers: bob.headers, id }))).rejects.toThrow(
		"EXPORT_UNAVAILABLE",
	);
	await expect(
		database.run(() => getAccountExport({ headers: new Headers({ origin: "http://localhost:3030" }), id })),
	).rejects.toThrow();
});
