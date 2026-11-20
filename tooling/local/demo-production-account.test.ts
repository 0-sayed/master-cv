import { expect, it } from "vite-plus/test";
import { assertProductionDemoAccount, productionDemoUsername } from "./demo-production-account";

const email = "boss-demo@example.test";
const account = {
	email,
	username: "ordinary",
	name: "Existing owner",
	role: "user",
	banned: false,
	twoFactorEnabled: false,
	dataDeletionRequestedAt: null,
	isAnonymous: false,
};
it("adopts an empty normal account but refuses any unmarked account with private data", () => {
	expect(assertProductionDemoAccount(account, email, false)).toBe(false);
	expect(() => assertProductionDemoAccount(account, email, true)).toThrow("DEMO_ACCOUNT_NOT_EMPTY");
});
it("requires both the reserved identity and synthetic name for a populated demo", () => {
	const marked = { ...account, username: productionDemoUsername(email), name: "Nawaf Al-Suhaili" };
	expect(assertProductionDemoAccount(marked, email, true)).toBe(true);
	expect(() => assertProductionDemoAccount({ ...marked, name: "Real owner" }, email, true)).toThrow(
		"DEMO_ACCOUNT_NOT_EMPTY",
	);
	expect(productionDemoUsername(email)).not.toBe(productionDemoUsername("another@example.test"));
});
it.each([
	{ email: "other@example.test" },
	{ role: "admin" },
	{ banned: true },
	{ twoFactorEnabled: true },
	{ isAnonymous: true },
	{ dataDeletionRequestedAt: new Date() },
])("refuses unsafe account states %j", (patch) => {
	expect(() => assertProductionDemoAccount({ ...account, ...patch }, email, false)).toThrow("DEMO_ACCOUNT_UNAVAILABLE");
});
