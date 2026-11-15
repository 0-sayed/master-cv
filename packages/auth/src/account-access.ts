import type { DbOrTx } from "@reactive-resume/db/client";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { lockActiveAccount } from "@reactive-resume/db/account-state";
import { db } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { account, accountActionProof, passkey, session, user } from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { proofPasskeyCeremony } from "./account-proof-ceremony";
import { auth } from "./config";
import { getTrustedOrigins } from "./trusted-origins";

export type PrivacyAction = "export_account" | "delete_account";
export type AccountAction = PrivacyAction | "change_email";
export type ProofMethod = "password" | "passkey";
export type FreshProof = { token: string; action: AccountAction; expiresAt: string };
export type ProofCredential =
	| { method: "password"; password: string; mfaCode?: string }
	| {
			method: "passkey";
			response: NonNullable<
				NonNullable<Parameters<typeof auth.api.verifyPasskeyAuthentication>[0]>["body"]
			>["response"];
	  };
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Always resolve the actual DB browser session; internal account bridges are not credentials. */
export async function requireAccountSession(headers: Headers, options: { readOnly?: boolean } = {}) {
	if (headers.has("authorization") || headers.has("x-api-key") || !headers.has("cookie"))
		throw new Error("BROWSER_SESSION_REQUIRED");
	if (
		(!(options.readOnly && !headers.has("origin")) &&
			!getTrustedOrigins(env.APP_URL).includes(headers.get("origin") ?? "")) ||
		headers.get("sec-fetch-site") === "cross-site"
	)
		throw new Error("ORIGIN_DENIED");
	const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
	if (!result?.session.id || !result.user.emailVerified) throw new Error("BROWSER_SESSION_REQUIRED");
	const [current] = await db
		.select({ id: session.id, userId: session.userId, mfaEnabled: user.twoFactorEnabled })
		.from(session)
		.innerJoin(user, eq(user.id, session.userId))
		.where(
			and(
				eq(session.id, result.session.id),
				eq(session.userId, result.user.id),
				sql`${session.expiresAt}>now()`,
				sql`${user.dataDeletionRequestedAt} IS NULL`,
			),
		);
	if (!current) throw new Error("BROWSER_SESSION_REQUIRED");
	return current;
}

export async function beginFreshProof(input: { headers: Headers; action: AccountAction; requestNonce: string }) {
	if (
		!["export_account", "delete_account", "change_email"].includes(input.action) ||
		input.requestNonce.length < 1 ||
		input.requestNonce.length > 128
	)
		throw new Error("INVALID_PROOF_REQUEST");
	const current = await requireAccountSession(input.headers);
	const enrolled = await db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, current.userId));
	let passkeyOptions: { challenge: string; rpId?: string; userVerification: "required" } | undefined;
	let passkeyCookie = "";
	if (enrolled.length) {
		const response = await auth.api.generatePasskeyAuthenticationOptions({ headers: input.headers, asResponse: true });
		if (!response.ok) throw new Error("PASSKEY_PROOF_UNAVAILABLE");
		const options = await response.json();
		passkeyOptions = { ...options, userVerification: "required" };
		passkeyCookie = response.headers
			.getSetCookie()
			.map((value) => value.split(";", 1)[0])
			.join("; ");
	}
	return withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		const [count] = await tx
			.select({ n: sql<number>`count(*)::int` })
			.from(accountActionProof)
			.where(
				and(
					eq(accountActionProof.userId, current.userId),
					sql`${accountActionProof.createdAt}>now()-interval '5 minutes'`,
				),
			);
		if ((count?.n ?? 0) >= 10) throw new Error("PROOF_RATE_LIMITED");
		const credentials = await tx
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, current.userId),
					eq(account.providerId, "credential"),
					sql`${account.password} IS NOT NULL`,
				),
			);
		const [challenge] = await tx
			.insert(accountActionProof)
			.values({
				id: randomUUID(),
				userId: current.userId,
				sessionId: current.id,
				action: input.action,
				requestNonce: input.requestNonce,
				expiresAt: sql`now()+interval '5 minutes'`,
				...(passkeyOptions
					? { challenge: { challenge: passkeyOptions.challenge, method: "passkey" as const, cookie: passkeyCookie } }
					: {}),
			})
			.returning();
		if (!challenge) throw new Error("PROOF_UNAVAILABLE");
		return {
			challengeId: challenge.id,
			expiresAt: challenge.expiresAt.toISOString(),
			methods: [...(credentials.length ? ["password" as const] : []), ...(enrolled.length ? ["passkey" as const] : [])],
			...(passkeyOptions ? { passkeyOptions } : {}),
		};
	});
}

export async function verifyFreshProof(input: {
	headers: Headers;
	challengeId: string;
	credential: ProofCredential;
}): Promise<FreshProof> {
	const current = await requireAccountSession(input.headers);
	const challenge = await withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		const [row] = await tx
			.update(accountActionProof)
			.set({ attempts: sql`${accountActionProof.attempts}+1` })
			.where(
				and(
					eq(accountActionProof.id, input.challengeId),
					eq(accountActionProof.userId, current.userId),
					eq(accountActionProof.sessionId, current.id),
					sql`${accountActionProof.expiresAt}>now()`,
					sql`${accountActionProof.tokenHash} IS NULL`,
					sql`${accountActionProof.attempts}<5`,
				),
			)
			.returning();
		if (!row) throw new Error("PROOF_EXPIRED_OR_INVALID");
		return row;
	});
	if (input.credential.method === "passkey") {
		if (!challenge.challenge) throw new Error("PASSKEY_PROOF_UNAVAILABLE");
		const ceremony = { userId: current.userId, verified: false };
		const passkeyHeaders = new Headers(input.headers);
		const boundCookies = challenge.challenge.cookie.split("; ");
		const names = new Set(boundCookies.map((cookie) => cookie.split("=", 1)[0]));
		const browserCookies = (input.headers.get("cookie") ?? "")
			.split(/;\s*/)
			.filter((cookie) => !names.has(cookie.split("=", 1)[0]));
		passkeyHeaders.set("cookie", [...browserCookies, ...boundCookies].join("; "));
		const credential = input.credential;
		const result = await proofPasskeyCeremony.run(ceremony, () =>
			auth.api.verifyPasskeyAuthentication({ headers: passkeyHeaders, body: { response: credential.response } }),
		);
		// The plugin creates a login session; never forward it, and remove it before minting proof.
		await db.delete(session).where(and(eq(session.id, result.session.id), eq(session.userId, current.userId)));
		if (!ceremony.verified || result.user.id !== current.userId) throw new Error("PASSKEY_OWNER_MISMATCH");
	} else {
		if (current.mfaEnabled && !input.credential.mfaCode) throw new Error("MFA_REQUIRED");
		await auth.api.verifyPassword({ headers: input.headers, body: { password: input.credential.password } });
		if (current.mfaEnabled && input.credential.mfaCode) {
			await auth.api.verifyTOTP({ headers: input.headers, body: { code: input.credential.mfaCode } });
		}
	}
	const token = randomBytes(32).toString("base64url");
	return withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		await requireAccountSession(input.headers);
		const [proof] = await tx
			.update(accountActionProof)
			.set({
				tokenHash: hashToken(token),
				method: input.credential.method,
				challenge: null,
				verifiedAt: sql`now()`,
				expiresAt: sql`now()+interval '5 minutes'`,
			})
			.where(
				and(
					eq(accountActionProof.id, challenge.id),
					sql`${accountActionProof.tokenHash} IS NULL`,
					sql`${accountActionProof.expiresAt}>now()`,
				),
			)
			.returning();
		if (!proof) throw new Error("PROOF_EXPIRED_OR_INVALID");
		return { token, action: proof.action, expiresAt: proof.expiresAt.toISOString() };
	});
}

/** Call inside the same owner transaction that persists the authorized request. */
export async function consumeFreshProof(
	tx: DbOrTx,
	input: { headers: Headers; token: string; action: AccountAction; requestNonce: string },
) {
	const current = await requireAccountSession(input.headers);
	await lockActiveAccount(tx, current.userId);
	const [proof] = await tx
		.update(accountActionProof)
		.set({ consumedAt: sql`now()` })
		.where(
			and(
				eq(accountActionProof.userId, current.userId),
				eq(accountActionProof.sessionId, current.id),
				eq(accountActionProof.action, input.action),
				eq(accountActionProof.requestNonce, input.requestNonce),
				eq(accountActionProof.tokenHash, hashToken(input.token)),
				sql`${accountActionProof.consumedAt} IS NULL`,
				sql`${accountActionProof.expiresAt}>now()`,
			),
		)
		.returning({ id: accountActionProof.id });
	if (!proof) throw new Error("PROOF_EXPIRED_OR_INVALID");
	return { userId: current.userId, sessionId: current.id };
}
