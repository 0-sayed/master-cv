import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { beforeAll, expect, it, vi } from "vite-plus/test";
import { hash } from "bcryptjs";
import { beginFreshProof, verifyFreshProof } from "@reactive-resume/auth/account-access";
import { auth } from "@reactive-resume/auth/config";
import { privacyTestDatabase } from "./testing/database";
vi.mock("@reactive-resume/email/transport", () => ({ sendEmail: vi.fn(), sendPrivacyEmail: vi.fn() }));
const database = privacyTestDatabase();
const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = keys.publicKey.export({ format: "jwk" });
const credentialId = randomBytes(32).toString("base64url");
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest();
let headers: Headers;
beforeAll(async () => {
	const password = "Passw0rd!".repeat(2);
	await database.admin().query("UPDATE \"user\" SET email_verified=true WHERE id='alice'");
	await database
		.admin()
		.query(
			"INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES ('credential','alice','alice','credential',$1)",
			[await hash(password, 4)],
		);
	const cose = Buffer.concat([
		Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
		Buffer.from(jwk.x ?? "", "base64url"),
		Buffer.from([0x22, 0x58, 0x20]),
		Buffer.from(jwk.y ?? "", "base64url"),
	]);
	await database
		.admin()
		.query(
			"INSERT INTO passkey(id,user_id,public_key,credential_id,counter,device_type,transports) VALUES ('passkey','alice',$1,$2,0,'singleDevice','internal')",
			[cose.toString("base64url"), credentialId],
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
function assertion(challenge: string, options: { uv?: boolean; origin?: string; rp?: string } = {}) {
	const clientData = Buffer.from(
		JSON.stringify({
			type: "webauthn.get",
			challenge,
			origin: options.origin ?? "http://localhost:3030",
			crossOrigin: false,
		}),
	);
	const authData = Buffer.concat([
		digest(options.rp ?? "localhost"),
		Buffer.from([options.uv === false ? 1 : 5]),
		Buffer.alloc(4),
	]);
	return {
		id: credentialId,
		rawId: credentialId,
		type: "public-key" as const,
		authenticatorAttachment: "platform" as const,
		clientExtensionResults: {},
		response: {
			clientDataJSON: clientData.toString("base64url"),
			authenticatorData: authData.toString("base64url"),
			signature: sign("sha256", Buffer.concat([authData, digest(clientData)]), keys.privateKey).toString("base64url"),
		},
	};
}
const begin = () =>
	database.run(() => beginFreshProof({ headers, action: "export_account", requestNonce: randomUUID() }));
it("cryptographically_verified_uv_passkey_mints_action_proof_without_login_cookie", async () => {
	const challenge = await begin();
	expect(challenge.methods).toContain("passkey");
	expect(challenge.passkeyOptions?.userVerification).toBe("required");
	const count = (await database.admin().query("SELECT count(*)::int AS n FROM session")).rows[0].n;
	const proof = await database.run(() =>
		verifyFreshProof({
			headers,
			challengeId: challenge.challengeId,
			credential: {
				method: "passkey",
				response: assertion(challenge.passkeyOptions?.challenge ?? "missing-server-challenge"),
			},
		}),
	);
	expect(proof.action).toBe("export_account");
	expect((await database.admin().query("SELECT count(*)::int AS n FROM session")).rows[0].n).toBe(count);
});
it("a stale browser passkey cookie cannot shadow the purpose-bound challenge", async () => {
	const challenge = await begin();
	const row = (
		await database.admin().query("SELECT challenge FROM account_action_proof WHERE id=$1", [challenge.challengeId])
	).rows[0];
	const cookieName = row.challenge.cookie.split("=", 1)[0];
	const stale = new Headers(headers);
	stale.set("cookie", `${headers.get("cookie")}; ${cookieName}=stale-registration-cookie`);
	const proof = await database.run(() =>
		verifyFreshProof({
			headers: stale,
			challengeId: challenge.challengeId,
			credential: { method: "passkey", response: assertion(challenge.passkeyOptions?.challenge ?? "missing") },
		}),
	);
	expect(proof.action).toBe("export_account");
});
it.each(["uv", "origin", "rp", "challenge", "owner"])("passkey rejects wrong %s", async (failure) => {
	const challenge = await begin();
	const response = assertion(
		failure === "challenge" ? "wrong-challenge" : (challenge.passkeyOptions?.challenge ?? "missing-server-challenge"),
		{
			uv: failure !== "uv",
			origin: failure === "origin" ? "https://other.test" : "http://localhost:3030",
			rp: failure === "rp" ? "other.test" : "localhost",
		},
	);
	if (failure === "owner") await database.admin().query("UPDATE passkey SET user_id='bob' WHERE id='passkey'");
	const logged = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await expect(
			database.run(() =>
				verifyFreshProof({ headers, challengeId: challenge.challengeId, credential: { method: "passkey", response } }),
			),
		).rejects.toThrow();
		expect(logged.mock.calls.flat().map(String).join(" ")).not.toContain(
			challenge.passkeyOptions?.challenge ?? "missing-server-challenge",
		);
	} finally {
		logged.mockRestore();
		await database.admin().query("UPDATE passkey SET user_id='alice' WHERE id='passkey'");
	}
});
it("passkey-only owner corrects email using a separate single-use purpose", async () => {
	const { requestEmailChange } = await import("@reactive-resume/auth/account-changes");
	await database.admin().query("DELETE FROM account WHERE user_id='alice' AND provider_id='credential'");
	const requestNonce = randomUUID();
	const challenge = await database.run(() => beginFreshProof({ headers, action: "change_email", requestNonce }));
	const proof = await database.run(() =>
		verifyFreshProof({
			headers,
			challengeId: challenge.challengeId,
			credential: { method: "passkey", response: assertion(challenge.passkeyOptions?.challenge ?? "missing") },
		}),
	);
	await expect(
		database.run(() =>
			requestEmailChange({
				headers,
				newEmail: "passkey-correction@example.test",
				requestNonce,
				credential: { method: "proof", token: proof.token },
			}),
		),
	).resolves.toEqual({ status: "pending" });
	await expect(
		database.run(() =>
			requestEmailChange({
				headers,
				newEmail: "replay@example.test",
				requestNonce,
				credential: { method: "proof", token: proof.token },
			}),
		),
	).rejects.toThrow();
});
