import { beforeEach, expect, it, vi } from "vite-plus/test";
import { ensureDemoAccount } from "./demo-account";
import { demoAccountName, demoCredentials } from "./demo-fixture";

const state = vi.hoisted(() => ({
	user: null as null | { id: string; name: string; email: string; username: string; emailVerified: boolean },
	accounts: [] as Array<{ providerId: string; userId: string; accountId: string; password: string | null }>,
	interrupt: false,
	collision: false,
}));
const context = vi.hoisted(() => ({
	adapter: { findOne: vi.fn(async () => (state.collision ? { id: "unrelated" } : state.user)) },
	password: {
		hash: vi.fn(async (password: string) => `configured:${password}`),
		verify: vi.fn(async ({ hash, password }: { hash: string; password: string }) => hash === `configured:${password}`),
	},
	internalAdapter: {
		updateUser: vi.fn(async (_id: string, input: { name: string }) => {
			if (state.user) state.user.name = input.name;
			return state.user;
		}),
		findUserByEmail: vi.fn(async () => (state.user ? { user: state.user, accounts: state.accounts } : null)),
		createUser: vi.fn(async (input: NonNullable<typeof state.user>) => {
			state.user = { ...input, id: "local-demo-user" };
			return state.user;
		}),
		linkAccount: vi.fn(async (input: (typeof state.accounts)[number]) => {
			if (state.interrupt) {
				state.interrupt = false;
				throw new Error("Synthetic interruption");
			}
			state.accounts.push(input);
			return input;
		}),
	},
}));
vi.mock("@reactive-resume/auth/config", () => ({ auth: { $context: Promise.resolve(context) } }));
vi.mock("@reactive-resume/api/routers", () => ({ default: {} }));

beforeEach(() => {
	state.user = null;
	state.accounts = [];
	state.interrupt = false;
	state.collision = false;
	vi.clearAllMocks();
});

it("creates a verified reserved identity through the configured credential adapter", async () => {
	const result = await ensureDemoAccount();
	expect(result.state).toBe("created");
	expect(result.user).toMatchObject({
		email: demoCredentials.email,
		username: demoCredentials.username,
		name: demoAccountName,
		emailVerified: true,
	});
	expect(context.password.hash).toHaveBeenCalledWith(demoCredentials.password);
	expect(state.accounts).toEqual([
		{
			providerId: "credential",
			accountId: "local-demo-user",
			userId: "local-demo-user",
			password: `configured:${demoCredentials.password}`,
		},
	]);
});

it("updates the legacy reserved display name only after checking its credential", async () => {
	await ensureDemoAccount();
	if (!state.user) throw new Error("Missing demo user");
	state.user.name = "Nawaf Al-Suhaili (fictional Sirawise local demo v1)";
	const credential = state.accounts[0];
	if (!credential) throw new Error("Missing credential");
	credential.password = "unrelated";
	await expect(ensureDemoAccount()).rejects.toThrow("DEMO_IDENTITY_COLLISION");
	expect(context.internalAdapter.updateUser).not.toHaveBeenCalled();
	credential.password = `configured:${demoCredentials.password}`;
	expect((await ensureDemoAccount()).user.name).toBe(demoAccountName);
	expect(context.internalAdapter.updateUser).toHaveBeenCalledOnce();
});

it("accepts a matching rerun without replacing credentials", async () => {
	await ensureDemoAccount();
	const before = structuredClone(state.accounts);
	expect((await ensureDemoAccount()).state).toBe("existing");
	expect(state.accounts).toEqual(before);
	expect(context.internalAdapter.createUser).toHaveBeenCalledTimes(1);
	expect(context.internalAdapter.linkAccount).toHaveBeenCalledTimes(1);
});

it.each(["identity", "password", "account-owner", "username"])(
	"refuses a reserved-email collision: %s",
	async (kind) => {
		await ensureDemoAccount();
		if (kind === "identity" && state.user) state.user.name = "Another person";
		if (kind === "password" && state.accounts[0]) state.accounts[0].password = "unrelated hash";
		if (kind === "account-owner" && state.accounts[0]) state.accounts[0].accountId = "another-owner";
		if (kind === "username") state.collision = true;
		const before = structuredClone({ user: state.user, accounts: state.accounts });
		await expect(ensureDemoAccount()).rejects.toThrow("DEMO_IDENTITY_COLLISION");
		expect({ user: state.user, accounts: state.accounts }).toEqual(before);
	},
);

it("recovers only an explicitly marked empty account after credential linking is interrupted", async () => {
	state.interrupt = true;
	await expect(ensureDemoAccount()).rejects.toThrow("Synthetic interruption");
	expect(state.user?.name).toBe(demoAccountName);
	expect(state.accounts).toHaveLength(0);
	expect((await ensureDemoAccount()).state).toBe("existing");
	expect(state.accounts).toHaveLength(1);
	expect(context.internalAdapter.createUser).toHaveBeenCalledTimes(1);
});

it("never fills an unmarked empty account or replaces another provider credential", async () => {
	state.user = {
		id: "someone",
		name: "Another person",
		email: demoCredentials.email,
		username: demoCredentials.username,
		emailVerified: true,
	};
	await expect(ensureDemoAccount()).rejects.toThrow("DEMO_IDENTITY_COLLISION");
	state.user.name = demoAccountName;
	state.accounts = [{ userId: "someone", accountId: "provider-account", providerId: "oauth", password: null }];
	await expect(ensureDemoAccount()).rejects.toThrow("DEMO_IDENTITY_COLLISION");
	expect(context.internalAdapter.linkAccount).not.toHaveBeenCalled();
});
