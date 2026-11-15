import { expect, it } from "vite-plus/test";
import { assertAccountActive, lockActiveAccount } from "@reactive-resume/db/account-state";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
it("active account is admitted and deletion closes admission", async () => {
	await database.run(() => assertAccountActive("alice"));
	await database.admin().query("UPDATE \"user\" SET data_deletion_requested_at=now() WHERE id='alice'");
	await expect(database.run(() => withOwnerDatabase("alice", (tx) => lockActiveAccount(tx, "alice")))).rejects.toThrow(
		"ACCOUNT_DELETION_PENDING",
	);
	await expect(database.run(() => assertAccountActive("alice"))).rejects.toThrow("ACCOUNT_DELETION_PENDING");
});
it("missing subject is not admitted", async () => {
	await expect(database.run(() => assertAccountActive("missing"))).rejects.toThrow("ACCOUNT_UNAVAILABLE");
});
