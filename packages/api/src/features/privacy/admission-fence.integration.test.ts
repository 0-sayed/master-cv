import { expect, it } from "vite-plus/test";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { lockDocumentOwner } from "../documents/ownership";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
it("a document writer admitted after deletion cannot acquire the publication lock", async () => {
	await database.admin().query("UPDATE \"user\" SET data_deletion_requested_at=now() WHERE id='alice'");
	await expect(database.run(() => withOwnerDatabase("alice", (tx) => lockDocumentOwner(tx, "alice")))).rejects.toThrow(
		"ACCOUNT_DELETION_PENDING",
	);
});
it("direct personal inserts and stale auth session creation are fenced by the database", async () => {
	await expect(
		database.queryAs("alice", "INSERT INTO career_profile(user_id,data) VALUES ('alice','{}')"),
	).rejects.toThrow("ACCOUNT_DELETION_PENDING");
	await expect(
		database.queryAs(
			"alice",
			"INSERT INTO session(id,user_id,token,expires_at) VALUES ('late','alice','synthetic-late',now()+interval '1 hour')",
		),
	).rejects.toThrow("ACCOUNT_DELETION_PENDING");
});
