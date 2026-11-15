import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { createElement } from "react";
import { lockActiveAccount } from "@reactive-resume/db/account-state";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { account, accountEmailChange, passkey, session, user } from "@reactive-resume/db/schema";
import { VerifyEmailChange, authMailMessage } from "@reactive-resume/email/templates/auth";
import { sendPrivacyEmail } from "@reactive-resume/email/transport";
import { env } from "@reactive-resume/env/server";
import { requireAccountSession, consumeFreshProof } from "./account-access";
import { auth } from "./config";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const key = () => new TextEncoder().encode(env.AUTH_SECRET);
const activeStages = ["confirm_old", "verify_new"];
function capability(userId: string, id: string) {
	return new SignJWT({ userId, id })
		.setProtectedHeader({ alg: "HS256" })
		.setAudience("account-email-change")
		.setJti(randomBytes(32).toString("base64url"))
		.setExpirationTime("1h")
		.sign(key());
}
async function deliver(row: typeof accountEmailChange.$inferSelect, token: string) {
	const locale = row.locale === "en-US" ? "en-US" : "ar-SA";
	const url = new URL("/api/auth/confirm-email-change", env.APP_URL);
	url.searchParams.set("token", token);
	try {
		await sendPrivacyEmail({
			key: `email-change:${row.id}:${row.tokenHash}`,
			to: row.stage === "confirm_old" ? row.previousEmail : row.newEmail,
			subject: authMailMessage("email.emailChange.subject", locale),
			react: createElement(VerifyEmailChange, {
				url: url.toString(),
				previousEmail: row.previousEmail,
				newEmail: row.newEmail,
				locale,
			}),
		});
	} catch {
		throw new Error("EMAIL_CHANGE_DELIVERY_FAILED");
	}
}
export async function getAccountSecurityState(headers: Headers) {
	const current = await requireAccountSession(headers);
	return withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
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
		const keys = await tx.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, current.userId));
		const sessions = await tx
			.select({
				id: session.id,
				createdAt: session.createdAt,
				lastActiveAt: session.updatedAt,
				userAgent: session.userAgent,
				expiresAt: session.expiresAt,
			})
			.from(session)
			.where(and(eq(session.userId, current.userId), sql`${session.expiresAt}>now()`));
		const [pending] = await tx
			.select({
				address: accountEmailChange.newEmail,
				stage: accountEmailChange.stage,
				previousEmail: accountEmailChange.previousEmail,
				requestedAt: accountEmailChange.requestedAt,
				expiresAt: accountEmailChange.expiresAt,
			})
			.from(accountEmailChange)
			.where(
				and(
					eq(accountEmailChange.userId, current.userId),
					inArray(accountEmailChange.stage, activeStages),
					sql`${accountEmailChange.expiresAt}>now()`,
				),
			);
		return {
			credentials: { hasPassword: credentials.length > 0, mfaEnabled: !!current.mfaEnabled, passkeyCount: keys.length },
			sessions: sessions.map((s) => ({
				id: s.id,
				createdAt: s.createdAt.toISOString(),
				expiresAt: s.expiresAt.toISOString(),
				lastActiveAt: s.lastActiveAt?.toISOString() ?? null,
				current: s.id === current.id,
				deviceLabel: describeDevice(s.userAgent),
			})),
			pendingEmail: pending
				? {
						address: pending.address,
						stage: pending.stage === "confirm_old" ? ("confirm_old" as const) : ("verify_new" as const),
						confirmationAddress: pending.stage === "confirm_old" ? pending.previousEmail : pending.address,
						requestedAt: pending.requestedAt.toISOString(),
						expiresAt: pending.expiresAt.toISOString(),
					}
				: null,
		};
	});
}
export async function requestEmailChange(input: {
	headers: Headers;
	newEmail: string;
	requestNonce: string;
	credential:
		| { method: "password"; password: string; mfaCode?: string | undefined }
		| { method: "proof"; token: string };
}) {
	const current = await requireAccountSession(input.headers);
	const newEmail = input.newEmail.trim().toLowerCase();
	if (
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) ||
		newEmail.length > 254 ||
		!input.requestNonce ||
		input.requestNonce.length > 128
	)
		throw new Error("INVALID_EMAIL_CHANGE");
	const id = randomUUID();
	const token = await capability(current.userId, id);
	// Persist failed attempts without replacing an existing valid transition.
	const state = await withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		const [attempts] = await tx
			.select({ n: sql<number>`count(*)::int` })
			.from(accountEmailChange)
			.where(
				and(
					eq(accountEmailChange.userId, current.userId),
					sql`${accountEmailChange.requestedAt}>now()-interval '5 minutes'`,
				),
			);
		if ((attempts?.n ?? 0) >= 10) throw new Error("EMAIL_CHANGE_RATE_LIMITED");
		const [owner] = await tx
			.select({ email: user.email, locale: user.uiLocale })
			.from(user)
			.where(eq(user.id, current.userId));
		const [password] = await tx
			.select({ hash: account.password })
			.from(account)
			.where(and(eq(account.userId, current.userId), eq(account.providerId, "credential")));
		if (!owner || (input.credential.method === "password" && !password?.hash))
			throw new Error("PASSWORD_METHOD_REQUIRED");
		if (owner.email === newEmail) throw new Error("EMAIL_UNCHANGED");
		const [row] = await tx
			.insert(accountEmailChange)
			.values({
				id,
				userId: current.userId,
				sessionId: current.id,
				previousEmail: owner.email,
				newEmail,
				locale: owner.locale ?? "ar-SA",
				requestNonce: input.requestNonce,
				tokenHash: digest(token),
				stage: "cancelled",
				expiresAt: sql`now()+interval '1 hour'`,
			})
			.returning();
		if (!row) throw new Error("EMAIL_CHANGE_UNAVAILABLE");
		return { row, passwordHash: password?.hash };
	});
	if (input.credential.method === "password") {
		if (current.mfaEnabled && !input.credential.mfaCode) throw new Error("MFA_REQUIRED");
		await auth.api.verifyPassword({ headers: input.headers, body: { password: input.credential.password } });
		if (current.mfaEnabled && input.credential.mfaCode)
			await auth.api.verifyTOTP({ headers: input.headers, body: { code: input.credential.mfaCode } });
	}

	const row = await withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		await requireAccountSession(input.headers);
		const [credential] = await tx
			.select({ hash: account.password })
			.from(account)
			.where(and(eq(account.userId, current.userId), eq(account.providerId, "credential")));
		if (input.credential.method === "proof")
			await consumeFreshProof(tx, {
				headers: input.headers,
				token: input.credential.token,
				action: "change_email",
				requestNonce: input.requestNonce,
			});
		if (credential?.hash !== state.passwordHash) throw new Error("CREDENTIAL_CHANGED");
		const [collision] = await tx.select({ id: user.id }).from(user).where(eq(user.email, newEmail));
		if (collision) throw new Error("EMAIL_UNAVAILABLE");
		await tx
			.update(accountEmailChange)
			.set({ stage: "cancelled" })
			.where(and(eq(accountEmailChange.userId, current.userId), inArray(accountEmailChange.stage, activeStages)));
		const [result] = await tx
			.update(accountEmailChange)
			.set({ stage: "confirm_old" })
			.where(eq(accountEmailChange.id, id))
			.returning();
		if (!result) throw new Error("EMAIL_CHANGE_UNAVAILABLE");
		return result;
	});
	await deliver(row, token);
	return { status: "pending" as const };
}
export async function cancelEmailChange(headers: Headers) {
	const current = await requireAccountSession(headers);
	await withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		await tx
			.update(accountEmailChange)
			.set({ stage: "cancelled" })
			.where(and(eq(accountEmailChange.userId, current.userId), inArray(accountEmailChange.stage, activeStages)));
	});
}
export async function verifyEmailChange(token: string) {
	const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"], audience: "account-email-change" });
	if (typeof payload.userId !== "string" || typeof payload.id !== "string") throw new Error("EMAIL_CHANGE_INVALID");
	const userId = payload.userId;
	const id = payload.id;
	const nextToken = await capability(userId, id);
	const result = await withOwnerDatabase(userId, async (tx) => {
		await lockActiveAccount(tx, userId);
		const [row] = await tx
			.select()
			.from(accountEmailChange)
			.where(
				and(
					eq(accountEmailChange.id, id),
					eq(accountEmailChange.userId, userId),
					inArray(accountEmailChange.stage, [...activeStages, "complete"]),
					sql`${accountEmailChange.expiresAt}>now()`,
				),
			);
		if (!row) throw new Error("EMAIL_CHANGE_INVALID");
		// Only the consumed approval can report progress. Rotated/unconsumed links remain invalid.
		if (row.approvedTokenHash === digest(token) && (row.stage === "verify_new" || row.stage === "complete"))
			return { status: row.stage === "complete" ? ("complete" as const) : ("verification_sent" as const) };
		if (row.tokenHash !== digest(token) || row.stage === "complete") throw new Error("EMAIL_CHANGE_INVALID");
		const [owner] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId));
		const [initiator] = await tx
			.select({ id: session.id })
			.from(session)
			.where(and(eq(session.id, row.sessionId), eq(session.userId, userId), sql`${session.expiresAt}>now()`));
		if (owner?.email !== row.previousEmail || !initiator) throw new Error("EMAIL_CHANGE_INVALID");
		if (row.stage === "confirm_old") {
			const [next] = await tx
				.update(accountEmailChange)
				.set({ stage: "verify_new", tokenHash: digest(nextToken), approvedTokenHash: digest(token) })
				.where(eq(accountEmailChange.id, id))
				.returning();
			if (!next) throw new Error("EMAIL_CHANGE_INVALID");
			// A failed send rolls back both capability rotation and stage. Re-click safely retries.
			await deliver(next, nextToken);
			return { status: "verification_sent" as const };
		}
		// Unique email constraint and transition consumption commit together. Never mint a login session.
		await tx.update(user).set({ email: row.newEmail, emailVerified: true }).where(eq(user.id, userId));
		await tx
			.update(account)
			.set({ accountId: row.newEmail })
			.where(
				and(eq(account.userId, userId), eq(account.providerId, "credential"), eq(account.accountId, row.previousEmail)),
			);
		await tx
			.update(accountEmailChange)
			.set({ stage: "complete", tokenHash: digest(randomBytes(32).toString("hex")) })
			.where(eq(accountEmailChange.id, id));
		await tx.delete(session).where(and(eq(session.userId, userId), ne(session.id, row.sessionId)));
		return { status: "complete" as const };
	});
	return result;
}
/** IDs are safe list handles. Better Auth tokens never cross this API boundary. */
export async function revokeAccountSessions(input: {
	headers: Headers;
	id?: string | undefined;
	others?: boolean | undefined;
}) {
	const current = await requireAccountSession(input.headers);
	if (input.others !== true && (!input.id || input.id === current.id)) throw new Error("INVALID_SESSION_SELECTION");
	await withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		await tx
			.delete(session)
			.where(
				and(
					eq(session.userId, current.userId),
					input.others ? ne(session.id, current.id) : eq(session.id, input.id ?? ""),
				),
			);
	});
}
export async function resendEmailChange(headers: Headers) {
	const current = await requireAccountSession(headers);
	const result = await withOwnerDatabase(current.userId, async (tx) => {
		await lockActiveAccount(tx, current.userId);
		const [row] = await tx
			.select()
			.from(accountEmailChange)
			.where(
				and(
					eq(accountEmailChange.userId, current.userId),
					inArray(accountEmailChange.stage, activeStages),
					sql`${accountEmailChange.expiresAt}>now()`,
				),
			);
		if (!row) throw new Error("EMAIL_CHANGE_INVALID");
		if (row.requestedAt.getTime() > Date.now() - 60_000) throw new Error("EMAIL_CHANGE_RATE_LIMITED");
		const token = await capability(current.userId, row.id);
		const [updated] = await tx
			.update(accountEmailChange)
			.set({ tokenHash: digest(token), requestedAt: sql`now()` })
			.where(eq(accountEmailChange.id, row.id))
			.returning();
		if (!updated) throw new Error("EMAIL_CHANGE_INVALID");
		await deliver(updated, token);
		return { status: "pending" as const };
	});
	return result;
}

/** Stored user-agent is untrusted metadata; retain only recognized browser/platform names. */
function describeDevice(agent: string | null): string | null {
	if (!agent) return null;
	const browser = [
		[/Edg\//, "Edge"],
		[/OPR\//, "Opera"],
		[/Chrome\/|CriOS\//, "Chrome"],
		[/Firefox\/|FxiOS\//, "Firefox"],
		[/Safari\//, "Safari"],
	].find(([pattern]) => (pattern as RegExp).test(agent))?.[1];
	const platform = [
		[/iPhone/, "iPhone"],
		[/iPad/, "iPad"],
		[/Android/, "Android"],
		[/Windows/, "Windows"],
		[/Macintosh|Mac OS X/, "macOS"],
		[/Linux/, "Linux"],
	].find(([pattern]) => (pattern as RegExp).test(agent))?.[1];
	return [browser, platform].filter(Boolean).join(" · ") || null;
}
