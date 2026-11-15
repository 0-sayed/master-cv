import { beforeAll, expect, it, vi } from "vite-plus/test";
import { hash } from "bcryptjs";
import {
	requestEmailChange,
	cancelEmailChange,
	verifyEmailChange,
	getAccountSecurityState,
	resendEmailChange,
} from "@reactive-resume/auth/account-changes";
import { auth } from "@reactive-resume/auth/config";
import { privacyTestDatabase } from "./testing/database";
const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@reactive-resume/email/transport", () => ({ sendPrivacyEmail: mail.send }));
const database = privacyTestDatabase();
const password = "Synthetic-Account-123";
let headers: Headers;
const latestToken = () => new URL(mail.send.mock.calls.at(-1)?.[0].react.props.url).searchParams.get("token") ?? "";
beforeAll(async () => {
	await database.admin().query("UPDATE \"user\" SET email_verified=true,ui_locale='ar-SA' WHERE id='alice'");
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
	headers = new Headers({
		origin: "http://localhost:3030",
		cookie: login.headers
			.getSetCookie()
			.map((v) => v.split(";", 1)[0])
			.join("; "),
	});
});
const request = (newEmail: string, requestNonce: string) =>
	database.run(() =>
		requestEmailChange({ headers, newEmail, credential: { method: "password", password }, requestNonce }),
	);
it("old_email_active_until_verified_commit_and_pending_survives_refresh", async () => {
	await request("replacement@example.test", "change-address");
	expect(mail.send.mock.calls.at(-1)?.[0].to).toBe("alice@example.test");
	const oldToken = latestToken();
	expect(await database.run(() => getAccountSecurityState(headers))).toMatchObject({
		pendingEmail: { address: "replacement@example.test" },
		credentials: { hasPassword: true, mfaEnabled: false, passkeyCount: 0 },
	});
	expect((await database.admin().query("SELECT email FROM \"user\" WHERE id='alice'")).rows[0].email).toBe(
		"alice@example.test",
	);
	await database.run(() => verifyEmailChange(oldToken));
	expect(mail.send.mock.calls.at(-1)?.[0].to).toBe("replacement@example.test");
	expect(mail.send.mock.calls.at(-1)?.[0].react.props.locale).toBe("ar-SA");
	const newToken = latestToken();
	expect((await database.admin().query("SELECT email FROM \"user\" WHERE id='alice'")).rows[0].email).toBe(
		"alice@example.test",
	);
	await database.run(() => verifyEmailChange(newToken));
	expect((await database.admin().query("SELECT email FROM \"user\" WHERE id='alice'")).rows[0].email).toBe(
		"replacement@example.test",
	);
	await expect(database.run(() => verifyEmailChange(newToken))).rejects.toThrow();
});
it("cancelled_superseded_and_expired_links_reject", async () => {
	await request("next@example.test", "next");
	const cancelled = latestToken();
	await database.run(() => cancelEmailChange(headers));
	await expect(database.run(() => verifyEmailChange(cancelled))).rejects.toThrow();
	await request("next@example.test", "next-new");
	const superseded = latestToken();
	await request("last@example.test", "last");
	await expect(database.run(() => verifyEmailChange(superseded))).rejects.toThrow();
	await database
		.admin()
		.query("UPDATE account_email_change SET expires_at=now()-interval '1 minute' WHERE user_id='alice'");
	await expect(database.run(() => verifyEmailChange(latestToken()))).rejects.toThrow();
});
it("address_collision_preserves_old_login", async () => {
	await expect(request("bob@example.test", "collision")).rejects.toThrow();
	expect((await database.admin().query("SELECT email FROM \"user\" WHERE id='alice'")).rows[0].email).toBe(
		"replacement@example.test",
	);
});
it("wrong_password_preserves_pending_state", async () => {
	await request("pending@example.test", "valid-pending");
	await expect(
		database.run(() =>
			requestEmailChange({
				headers,
				newEmail: "other@example.test",
				credential: { method: "password", password: "wrong-password" },
				requestNonce: "wrong",
			}),
		),
	).rejects.toThrow();
	expect(
		(
			await database
				.admin()
				.query("SELECT new_email FROM account_email_change WHERE user_id='alice' AND stage='confirm_old'")
		).rows[0].new_email,
	).toBe("pending@example.test");
});
it("session_listing_is_owner_only_and_has_no_token", async () => {
	const state = await database.run(() => getAccountSecurityState(headers));
	expect(state.sessions).toHaveLength(1);
	expect(state.sessions[0]?.current).toBe(true);
	expect(JSON.stringify(state.sessions)).not.toContain("token");
});
it("raw_email_change_cannot_bypass_transition", async () => {
	const response = await database.run(() =>
		auth.handler(
			new Request("http://localhost:3030/api/auth/change-email", {
				method: "POST",
				headers: new Headers({ ...Object.fromEntries(headers), "content-type": "application/json" }),
				body: JSON.stringify({ newEmail: "bypass@example.test" }),
			}),
		),
	);
	expect(response.status).toBe(403);
});
it("revoking_other_sessions_invalidates_their_proofs", async () => {
	const login = await database.run(() =>
		auth.handler(
			new Request("http://localhost:3030/api/auth/sign-in/email", {
				method: "POST",
				headers: { origin: "http://localhost:3030", "content-type": "application/json" },
				body: JSON.stringify({ email: "replacement@example.test", password }),
			}),
		),
	);
	const otherHeaders = new Headers({
		origin: "http://localhost:3030",
		cookie: login.headers
			.getSetCookie()
			.map((v) => v.split(";", 1)[0])
			.join("; "),
	});
	const { beginFreshProof, verifyFreshProof } = await import("@reactive-resume/auth/account-access");
	const challenge = await database.run(() =>
		beginFreshProof({ headers: otherHeaders, action: "export_account", requestNonce: "revoke-proof" }),
	);
	await database.run(() =>
		verifyFreshProof({
			headers: otherHeaders,
			challengeId: challenge.challengeId,
			credential: { method: "password", password },
		}),
	);
	const { revokeAccountSessions } = await import("@reactive-resume/auth/account-changes");
	await database.run(() => revokeAccountSessions({ headers, others: true }));
	expect(
		(
			await database
				.admin()
				.query("SELECT count(*)::int AS n FROM account_action_proof WHERE request_nonce='revoke-proof'")
		).rows[0].n,
	).toBe(0);
});
it("raw_update_user_rejects_unvalidated_image_and_email", async () => {
	const response = await database.run(() =>
		auth.handler(
			new Request("http://localhost:3030/api/auth/update-user", {
				method: "POST",
				headers: new Headers({ ...Object.fromEntries(headers), "content-type": "application/json" }),
				body: JSON.stringify({ image: "https://unreviewed.example.test/picture.png", email: "bypass@example.test" }),
			}),
		),
	);
	expect(response.status).toBeGreaterThanOrEqual(400);
});
it("credential changes cancel pending email capabilities", async () => {
	await request("after-credential@example.test", "credential-transition");
	await database
		.admin()
		.query("UPDATE account SET password=password WHERE user_id='alice' AND provider_id='credential'");
	const state = await database.run(() => getAccountSecurityState(headers));
	expect(state.pendingEmail).toBeNull();
});

it("resend rotates the mail identity and rejects the previous capability", async () => {
	await database.admin().query("DELETE FROM account_email_change WHERE user_id='alice'");
	await request("resend@example.test", "resend");
	const first = mail.send.mock.calls.at(-1)?.[0];
	const oldToken = latestToken();
	await database
		.admin()
		.query("UPDATE account_email_change SET requested_at=now()-interval '2 minutes' WHERE user_id='alice'");
	await database.run(() => resendEmailChange(headers));
	expect(mail.send.mock.calls.at(-1)?.[0].key).not.toBe(first.key);
	await expect(database.run(() => verifyEmailChange(oldToken))).rejects.toThrow();
	await database.run(() => verifyEmailChange(latestToken()));
});
it("a held email confirmation transport cannot restore an identity transition after deletion admission", async () => {
	const { syntheticAccountSession } = await import("./testing/account");
	const { requestAccountDeletion } = await import("./deletion");
	const session = await syntheticAccountSession(database, "bob");
	const started = Promise.withResolvers<void>();
	const finish = Promise.withResolvers<void>();
	mail.send.mockImplementationOnce(async () => {
		started.resolve();
		await finish.promise;
	});
	const request = database
		.run(() =>
			requestEmailChange({
				headers: session.headers,
				newEmail: "late@example.test",
				credential: { method: "password", password },
				requestNonce: "late-email",
			}),
		)
		.then(
			() => null,
			(error) => error,
		);
	await started.promise;
	const token = latestToken();
	await database.run(async () =>
		requestAccountDeletion({ headers: session.headers, ...(await session.proof("delete_account")), confirmed: true }),
	);
	finish.resolve();
	await request;
	await expect(database.run(() => verifyEmailChange(token))).rejects.toThrow();
	expect((await database.admin().query("SELECT email FROM \"user\" WHERE id='bob'")).rows[0].email).toBe(
		"bob@example.test",
	);
	expect((await database.admin().query("SELECT id FROM session WHERE user_id='bob'")).rowCount).toBe(0);
});

it("delivery rejection preserves the old capability and repeat approval reflects the saved stage", async () => {
	await database.admin().query("DELETE FROM account_email_change WHERE user_id='alice'");
	await request("delivery@example.test", "delivery-retry");
	const token = latestToken();
	mail.send.mockRejectedValueOnce(new Error("PRIVACY_MAIL_RETRY_REQUIRED"));
	await expect(database.run(() => verifyEmailChange(token))).rejects.toThrow("EMAIL_CHANGE_DELIVERY_FAILED");
	expect(
		(await database.admin().query("SELECT stage FROM account_email_change WHERE user_id='alice'")).rows[0].stage,
	).toBe("confirm_old");
	await expect(database.run(() => verifyEmailChange(token))).resolves.toEqual({ status: "verification_sent" });
	const nextToken = latestToken();
	const count = mail.send.mock.calls.length;
	await expect(database.run(() => verifyEmailChange(token))).resolves.toEqual({ status: "verification_sent" });
	expect(mail.send.mock.calls.length).toBe(count);
	expect(await database.run(() => getAccountSecurityState(headers))).toMatchObject({
		pendingEmail: { stage: "verify_new", confirmationAddress: "delivery@example.test" },
	});
	await database.run(() => verifyEmailChange(nextToken));
	await expect(database.run(() => verifyEmailChange(token))).resolves.toEqual({ status: "complete" });
});
