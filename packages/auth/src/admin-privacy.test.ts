import { expect, it } from "vite-plus/test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { env } from "@reactive-resume/env/server";
import { auth } from "./config";

it("hides and protects retained admin columns through the real authentication handler", async () => {
	const store: Record<string, Record<string, unknown>[]> = {
		user: [],
		session: [],
		account: [],
		verification: [],
		jwks: [],
		oauthResource: [],
		oauthClient: [],
		oauthConsent: [],
		oauthAccessToken: [],
		oauthRefreshToken: [],
		twoFactor: [],
		passkey: [],
		apikey: [],
	};
	const instance = betterAuth({
		...auth.options,
		database: memoryAdapter(store),
		emailVerification: { sendOnSignUp: false },
		emailAndPassword: { ...auth.options.emailAndPassword, requireEmailVerification: false },
	});
	const request = (path: string, body?: object, cookie = "") =>
		instance.handler(
			new Request(`${env.APP_URL}/api/auth/${path}`, {
				method: body ? "POST" : "GET",
				headers: { origin: env.APP_URL, "content-type": "application/json", cookie },
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	const identity = { email: "privacy@example.test", password: "Synthetic-password-123" };
	const signup = await request("sign-up/email", { ...identity, name: "Private", username: "privacy" });
	expect(signup.status).toBe(200);
	const account = store.user?.[0];
	if (!account) throw new Error("Missing synthetic account");
	Object.assign(account, {
		emailVerified: true,
		role: "admin",
		banned: true,
		banReason: "private reason",
		banExpires: new Date(),
	});
	const login = await request("sign-in/email", identity);
	expect(login.status).toBe(200);
	const cookie = login.headers
		.getSetCookie()
		.map((value) => value.split(";", 1)[0])
		.join("; ");
	await request("update-user", { role: "user", banned: false, banReason: "client input" }, cookie);
	const session = await (await request("get-session", undefined, cookie)).json();
	for (const field of ["role", "banned", "banReason", "banExpires"]) expect(session.user).not.toHaveProperty(field);
	expect(session.session).not.toHaveProperty("impersonatedBy");
	expect(account).toMatchObject({ role: "admin", banned: true, banReason: "private reason" });
	for (const path of ["impersonate-user", "ban-user", "set-role"])
		expect([404, 405]).toContain((await request(`admin/${path}`, {}, cookie)).status);
	expect([404, 405]).toContain((await request("admin/list-users", undefined, cookie)).status);
});
