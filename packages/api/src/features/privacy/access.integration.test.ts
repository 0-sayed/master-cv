import { randomUUID } from "node:crypto";
import { beforeAll, expect, it } from "vite-plus/test";
import { createRouterClient } from "@orpc/server";
import { hash } from "bcryptjs";
import { beginFreshProof, verifyFreshProof, consumeFreshProof } from "@reactive-resume/auth/account-access";
import { auth } from "@reactive-resume/auth/config";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { user } from "@reactive-resume/db/schema";
import { authRouter } from "../auth/router";
import { privacyTestDatabase } from "./testing/database";
const database = privacyTestDatabase();
const password = "Synthetic-Account-123";
let headers: Headers;
beforeAll(async () => {
	await database.admin().query("UPDATE \"user\" SET email_verified=true WHERE id='alice'");
	await database
		.admin()
		.query(
			"INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES ('credential','alice','alice','credential',$1)",
			[await hash(password, 4)],
		);
	const login = await database.run(() =>
		auth.handler(
			new Request("http://localhost:3030/api/auth/sign-in/email", {
				method: "POST",
				headers: { origin: "http://localhost:3030", "content-type": "application/json" },
				body: JSON.stringify({ email: "alice@example.test", password }),
			}),
		),
	);
	expect(login.status).toBe(200);
	headers = new Headers({
		origin: "http://localhost:3030",
		cookie: login.headers
			.getSetCookie()
			.map((v) => v.split(";", 1)[0])
			.join("; "),
	});
});
const begin = (action: "export_account" | "delete_account" = "export_account", requestNonce = randomUUID()) =>
	database.run(() => beginFreshProof({ headers, action, requestNonce }));
const verified = async (action: "export_account" | "delete_account" = "export_account") => {
	const requestNonce = randomUUID();
	const challenge = await begin(action, requestNonce);
	const proof = await database.run(() =>
		verifyFreshProof({ headers, challengeId: challenge.challengeId, credential: { method: "password", password } }),
	);
	return { proof, requestNonce };
};
it("login_does_not_mint_proof", async () => {
	expect(
		(await database.admin().query("SELECT count(*)::int AS n FROM account_action_proof WHERE token_hash IS NOT NULL"))
			.rows[0].n,
	).toBe(0);
});
it("rejects_timestamp_recent_login_and_bridge_session", async () => {
	await expect(database.run(() => consumeFreshProofWithToken("recent-login"))).rejects.toThrow();
	for (const h of [
		new Headers({ origin: "http://localhost:3030" }),
		new Headers({ ...Object.fromEntries(headers), "x-api-key": "synthetic" }),
		new Headers({ ...Object.fromEntries(headers), authorization: "Bearer synthetic" }),
	]) {
		await expect(
			database.run(() => beginFreshProof({ headers: h, action: "delete_account", requestNonce: randomUUID() })),
		).rejects.toThrow();
	}
});
function consumeFreshProofWithToken(token: string) {
	return withOwnerDatabase("alice", (tx) =>
		consumeFreshProof(tx, { headers, token, action: "export_account", requestNonce: "nonce" }),
	);
}
it("expires_at_300000ms", async () => {
	const { proof } = await verified();
	const row = (
		await database
			.admin()
			.query(
				"SELECT expires_at-verified_at AS duration,token_hash FROM account_action_proof WHERE token_hash IS NOT NULL ORDER BY verified_at DESC LIMIT 1",
			)
	).rows[0];
	expect(row.duration.minutes).toBe(5);
	expect(row.token_hash).not.toBe(proof.token);
	await database
		.admin()
		.query(
			"UPDATE account_action_proof SET verified_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes' WHERE token_hash=$1",
			[row.token_hash],
		);
	await expect(database.run(() => consumeFreshProofWithToken(proof.token))).rejects.toThrow();
});
it("rejects_wrong_action_owner_revoked_session", async () => {
	const { proof, requestNonce } = await verified();
	await expect(
		database.run(() =>
			withOwnerDatabase("alice", (tx) =>
				consumeFreshProof(tx, { headers, token: proof.token, action: "delete_account", requestNonce }),
			),
		),
	).rejects.toThrow();
	await expect(
		database.run(() =>
			withOwnerDatabase("alice", (tx) =>
				consumeFreshProof(tx, { headers, token: proof.token, action: "export_account", requestNonce: "wrong" }),
			),
		),
	).rejects.toThrow();
});
it("two_consumers_create_one_request", async () => {
	const { proof, requestNonce } = await verified();
	const consume = () =>
		database.run(() =>
			withOwnerDatabase("alice", (tx) =>
				consumeFreshProof(tx, { headers, token: proof.token, action: "export_account", requestNonce }),
			),
		);
	const results = await Promise.allSettled([consume(), consume()]);
	expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("rollback_does_not_consume_proof", async () => {
	const { proof, requestNonce } = await verified();
	await expect(
		database.run(() =>
			withOwnerDatabase("alice", async (tx) => {
				await consumeFreshProof(tx, { headers, token: proof.token, action: "export_account", requestNonce });
				throw new Error("rollback");
			}),
		),
	).rejects.toThrow("rollback");
	await expect(
		database.run(() =>
			withOwnerDatabase("alice", (tx) =>
				consumeFreshProof(tx, { headers, token: proof.token, action: "export_account", requestNonce }),
			),
		),
	).resolves.toMatchObject({ userId: "alice" });
});
it("password_requires_enrolled_mfa", async () => {
	await database.admin().query("UPDATE \"user\" SET two_factor_enabled=true WHERE id='alice'");
	const challenge = await begin();
	await expect(
		database.run(() =>
			verifyFreshProof({ headers, challengeId: challenge.challengeId, credential: { method: "password", password } }),
		),
	).rejects.toThrow("MFA_REQUIRED");
	await database.admin().query("UPDATE \"user\" SET two_factor_enabled=false WHERE id='alice'");
});
it("credential_change_invalidates_existing_proof", async () => {
	const { proof, requestNonce } = await verified();
	await database.admin().query("UPDATE account SET password=$1 WHERE id='credential'", [await hash(password, 4)]);
	await expect(
		database.run(() =>
			withOwnerDatabase("alice", (tx) =>
				consumeFreshProof(tx, { headers, token: proof.token, action: "export_account", requestNonce }),
			),
		),
	).rejects.toThrow();
});
it("legacy_export_and_delete_routes_require_new_proof_workflow", async () => {
	const [owner] = await database.run(() => db.select().from(user));
	if (!owner) throw new Error("Missing fixture");
	const client = createRouterClient(authRouter, {
		context: {
			locale: "en-US",
			reqHeaders: headers,
			authentication: { user: owner, method: "session", permissions: ["read", "write", "delete"] },
		},
	});
	await expect(database.run(() => client.exportData())).rejects.toMatchObject({ code: "FORBIDDEN" });
	await expect(database.run(() => client.deleteAccount())).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("revoked_session_cannot_verify", async () => {
	const challenge = await begin();
	await database.admin().query("DELETE FROM session WHERE user_id='alice'");
	await expect(
		database.run(() =>
			verifyFreshProof({ headers, challengeId: challenge.challengeId, credential: { method: "password", password } }),
		),
	).rejects.toThrow();
});
