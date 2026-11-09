import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { withDatabasePool } from "@reactive-resume/db/client";
import { env } from "@reactive-resume/env/server";

const fixturePassword = "Synthetic-pass-123"; // gitleaks:allow -- Disposable synthetic account only.
const replacementPassword = "Replacement-pass-123"; // gitleaks:allow -- Disposable synthetic account only.

const mail = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@reactive-resume/email/transport", () => ({ sendEmail: mail.send }));

const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.map((value) => value.split(";", 1)[0])
		.join("; ");

describe.skipIf(!process.env.COVER_LETTER_TEST_DATABASE_URL)("verified email accounts", () => {
	const name = `t003_auth_${randomUUID().replaceAll("-", "")}`;
	let admin: Pool;
	let pool: Pool;
	let auth: typeof import("./config").auth;
	beforeAll(async () => {
		const databaseUrl = process.env.COVER_LETTER_TEST_DATABASE_URL;
		if (!databaseUrl) throw new Error("Disposable admin database required");
		admin = new Pool({ connectionString: databaseUrl });
		await admin.query(`CREATE DATABASE "${name}"`);
		const url = new URL(databaseUrl);
		url.pathname = `/${name}`;
		pool = new Pool({ connectionString: url.toString() });
		await migrate(drizzle({ client: pool }), {
			migrationsFolder: fileURLToPath(new URL("../../../migrations", import.meta.url)),
		});
		({ auth } = await import("./config"));
	}, 30_000);
	afterAll(async () => {
		await pool?.end();
		if (admin) {
			await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
			await admin.end();
		}
	});
	const request = (path: string, body?: object, cookie = "") =>
		withDatabasePool(pool, () =>
			auth.handler(
				new Request(`${env.APP_URL}/api/auth/${path}`, {
					method: body ? "POST" : "GET",
					headers: { origin: env.APP_URL, "content-type": "application/json", cookie },
					...(body ? { body: JSON.stringify(body) } : {}),
				}),
			),
		);

	it("issues no signup session and requires email proof before password login", async () => {
		mail.send.mockClear();
		const signup = await request("sign-up/email", {
			name: "Synthetic Account",
			email: "alice@example.test",
			username: "alice",
			password: fixturePassword,
			uiLocale: "ar-SA",
		});
		expect(signup.status, await signup.clone().text()).toBe(200);
		expect((await signup.json()).token).toBeNull();
		expect(await (await request("get-session", undefined, cookieOf(signup))).json()).toBeNull();
		const denied = await request("sign-in/email", { email: "alice@example.test", password: fixturePassword });
		expect(denied.status).toBe(403);
		expect(await denied.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
		expect(mail.send).toHaveBeenCalled();
		const verificationUrl = mail.send.mock.calls[0]?.[0]?.react.props.url;
		expect(typeof verificationUrl).toBe("string");
		const verified = await withDatabasePool(pool, () => auth.handler(new Request(verificationUrl)));
		expect(verified.status).toBeLessThan(400);
		expect(await (await request("get-session", undefined, cookieOf(verified))).json()).toBeNull();
		const login = await request("sign-in/email", { email: "alice@example.test", password: fixturePassword });
		expect(login.status, await login.clone().text()).toBe(200);
		expect(await (await request("get-session", undefined, cookieOf(login))).json()).toMatchObject({
			user: { emailVerified: true, uiLocale: "ar-SA" },
		});
	});
	it("resets once, revokes sessions and retains enrolled MFA", async () => {
		const login = await request("sign-in/email", { email: "alice@example.test", password: fixturePassword });
		let cookie = cookieOf(login);
		const enroll = await request("two-factor/enable", { password: fixturePassword }, cookie);
		expect(enroll.status, await enroll.clone().text()).toBe(200);
		const { totpURI } = await enroll.json();
		const encoded = new URL(totpURI).searchParams.get("secret");
		const bits = [...(encoded ?? "")]
			.map((char) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0"))
			.join("");
		const secret = Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []).toString();
		if (!secret) throw new Error("Missing enrollment secret");
		const otp = await auth.api.generateTOTP({ body: { secret } });
		const enabled = await request("two-factor/verify-totp", { code: otp.code }, cookie);
		expect(enabled.status, await enabled.clone().text()).toBe(200);
		cookie = cookieOf(enabled) || cookie;
		mail.send.mockClear();
		const known = await request("request-password-reset", {
			email: "alice@example.test",
			redirectTo: `${env.APP_URL}/auth/reset-password`,
		});
		const unknown = await request("request-password-reset", {
			email: "unknown@example.test",
			redirectTo: `${env.APP_URL}/auth/reset-password`,
		});
		expect(known.status).toBe(200);
		expect(await known.json()).toEqual(await unknown.json());
		const resetUrl = new URL(mail.send.mock.calls[0]?.[0]?.react.props.url);
		const token = resetUrl.pathname.split("/").at(-1);
		const reset = await request("reset-password", { token, newPassword: replacementPassword });
		expect(reset.status, await reset.clone().text()).toBe(200);
		expect(await (await request("get-session", undefined, cookie)).json()).toBeNull();
		expect(await (await request("get-session", undefined, cookieOf(reset))).json()).toBeNull();
		expect((await request("reset-password", { token, newPassword: "Repeated-pass-123" })).status).toBe(400);
		expect((await request("sign-in/email", { email: "alice@example.test", password: fixturePassword })).status).toBe(
			401,
		);
		const challenge = await request("sign-in/email", { email: "alice@example.test", password: replacementPassword });
		expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
		expect(await (await request("get-session", undefined, cookieOf(challenge))).json()).toBeNull();
		const secondOtp = await auth.api.generateTOTP({ body: { secret } });
		const completed = await request("two-factor/verify-totp", { code: secondOtp.code }, cookieOf(challenge));
		expect(completed.status, await completed.clone().text()).toBe(200);
		expect(await (await request("get-session", undefined, cookieOf(completed))).json()).toMatchObject({
			user: { emailVerified: true, twoFactorEnabled: true },
		});
	});
	it("rejects malformed proof, expired reset and disabled guest/mobile paths", async () => {
		expect((await request("verify-email?token=malformed")).status).toBeGreaterThanOrEqual(400);
		mail.send.mockClear();
		await request("request-password-reset", {
			email: "alice@example.test",
			redirectTo: `${env.APP_URL}/auth/reset-password`,
		});
		const token = new URL(mail.send.mock.calls[0]?.[0]?.react.props.url).pathname.split("/").at(-1);
		await pool.query("UPDATE verification SET expires_at = now() - interval '1 second' WHERE identifier = $1", [
			`reset-password:${token}`,
		]);
		expect((await request("reset-password", { token, newPassword: "Expired-pass-123" })).status).toBe(400);
		expect((await request("sign-in/anonymous", {})).status).toBe(403);
		expect(
			(await request("sign-in/phone-number", { phoneNumber: "+966500000000", password: fixturePassword })).status,
		).toBe(404);
	});

	it("resends proof, rejects expired verification, and never creates a session from reused proof", async () => {
		mail.send.mockClear();
		await request("sign-up/email", {
			name: "Resend",
			email: "resend@example.test",
			username: "resend",
			password: fixturePassword,
		});
		const first = mail.send.mock.calls[0]?.[0]?.react.props.url;
		const { SignJWT } = await import("jose");
		const expired = await new SignJWT({ email: "resend@example.test" })
			.setProtectedHeader({ alg: "HS256" })
			.setExpirationTime(Math.floor(Date.now() / 1000) - 10)
			.sign(new TextEncoder().encode(env.AUTH_SECRET));
		expect((await request(`verify-email?token=${expired}`)).status).toBe(401);
		expect(
			(await pool.query('SELECT email_verified FROM "user" WHERE email=$1', ["resend@example.test"])).rows[0]
				.email_verified,
		).toBe(false);
		expect(
			(await request("send-verification-email", { email: "resend@example.test", callbackURL: "/auth/login" })).status,
		).toBe(200);
		expect(mail.send.mock.calls.length).toBe(2);
		const verified = await withDatabasePool(pool, () => auth.handler(new Request(first)));
		expect(verified.status).toBeLessThan(400);
		const reused = await withDatabasePool(pool, () => auth.handler(new Request(first)));
		expect(await (await request("get-session", undefined, cookieOf(reused))).json()).toBeNull();
	});

	it("honors production rate rules and disables signup/email-password routes", async () => {
		const production = betterAuth({ ...auth.options, rateLimit: { ...auth.options.rateLimit, enabled: true } });
		const call = (instance: { handler: (request: Request) => Promise<Response> }, path: string, body: object) =>
			withDatabasePool(pool, () =>
				instance.handler(
					new Request(`${env.APP_URL}/api/auth/${path}`, {
						method: "POST",
						headers: { origin: env.APP_URL, "content-type": "application/json", "x-real-ip": "192.0.2.201" },
						body: JSON.stringify(body),
					}),
				),
			);
		for (let n = 0; n < 3; n++)
			expect(
				(
					await call(production, "request-password-reset", {
						email: "nobody@example.test",
						redirectTo: `${env.APP_URL}/auth/reset-password`,
					})
				).status,
			).toBe(200);
		expect((await call(production, "request-password-reset", { email: "nobody@example.test" })).status).toBe(429);
		const disabled = betterAuth({
			...auth.options,
			emailAndPassword: { ...auth.options.emailAndPassword, enabled: false, disableSignUp: true },
		});
		expect(
			(
				await call(disabled, "sign-up/email", {
					name: "Disabled",
					email: "disabled@example.test",
					username: "disabled",
					password: fixturePassword,
				})
			).status,
		).toBeGreaterThanOrEqual(400);
		expect(
			(await call(disabled, "sign-in/email", { email: "resend@example.test", password: fixturePassword })).status,
		).toBeGreaterThanOrEqual(400);
	});
});
