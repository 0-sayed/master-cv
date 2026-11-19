import type { RouterClient } from "@orpc/server";
import type { AuthSession } from "@reactive-resume/auth/types";
import { createRouterClient } from "@orpc/server";
import router from "@reactive-resume/api/routers";
import { auth } from "@reactive-resume/auth/config";
import { demoAccountName, demoCredentials } from "./demo-fixture";

export type DemoUser = AuthSession["user"];

export async function ensureDemoAccount(): Promise<{ user: DemoUser; state: "created" | "existing" }> {
	const context = await auth.$context;
	const username = await context.adapter.findOne<{ id: string }>({
		model: "user",
		where: [{ field: "username", value: demoCredentials.username }],
	});
	const found = await context.internalAdapter.findUserByEmail(demoCredentials.email, { includeAccounts: true });
	if (username && username.id !== found?.user.id) throw new Error("DEMO_IDENTITY_COLLISION");
	const state = found ? "existing" : "created";
	const user =
		found?.user ??
		(await context.internalAdapter.createUser<DemoUser>(
			{
				name: demoAccountName,
				email: demoCredentials.email,
				username: demoCredentials.username,
				displayUsername: demoCredentials.username,
				emailVerified: true,
				locale: "ar-SA",
				timezone: "Asia/Riyadh",
			},
			{ method: "email-password" },
		));
	if (
		user.email !== demoCredentials.email ||
		![demoAccountName, "Nawaf Al-Suhaili (fictional Sirawise local demo v1)"].includes(user.name) ||
		!("username" in user) ||
		user.username !== demoCredentials.username ||
		!user.emailVerified
	)
		throw new Error("DEMO_IDENTITY_COLLISION");
	const accounts = found?.accounts ?? [];
	if (accounts.length) {
		const credential = accounts[0];
		if (
			accounts.length !== 1 ||
			!credential ||
			credential.providerId !== "credential" ||
			credential.userId !== user.id ||
			credential.accountId !== user.id ||
			!credential.password ||
			!(await context.password.verify({ password: demoCredentials.password, hash: credential.password }))
		)
			throw new Error("DEMO_IDENTITY_COLLISION");
	} else {
		const password = await context.password.hash(demoCredentials.password);
		await context.internalAdapter.linkAccount({
			userId: user.id,
			accountId: user.id,
			providerId: "credential",
			password,
		});
	}
	if (user.name !== demoAccountName) await context.internalAdapter.updateUser(user.id, { name: demoAccountName });
	const stored = await context.adapter.findOne<DemoUser>({ model: "user", where: [{ field: "id", value: user.id }] });
	if (!stored) throw new Error("DEMO_ACCOUNT_READBACK_FAILED");
	return { user: stored, state };
}

export function createDemoClient(user: DemoUser, appUrl: string): RouterClient<typeof router> {
	return createRouterClient(router, {
		context: {
			authentication: { user, method: "session", permissions: ["read", "write", "delete"] },
			locale: "ar-SA",
			reqHeaders: new Headers({ origin: appUrl }),
			resHeaders: new Headers(),
		},
	});
}
