import { createHash } from "node:crypto";

/** A reserved, stable marker, independent of the public local account. */
export function productionDemoUsername(email: string) {
	return `production-demo-${createHash("sha256").update(email).digest("hex").slice(0, 24)}`;
}

export function assertProductionDemoAccount(
	account: {
		email: string;
		username: string;
		name: string;
		role: string | null;
		banned: boolean | null;
		twoFactorEnabled: boolean;
		dataDeletionRequestedAt: Date | null;
		isAnonymous: boolean;
	},
	email: string,
	hasData: boolean,
) {
	if (
		account.email.toLowerCase() !== email ||
		account.role !== "user" ||
		account.banned ||
		account.twoFactorEnabled ||
		account.dataDeletionRequestedAt ||
		account.isAnonymous
	)
		throw new Error("DEMO_ACCOUNT_UNAVAILABLE");
	const marked = account.username === productionDemoUsername(email) && account.name === "Nawaf Al-Suhaili";
	if (!marked && hasData) throw new Error("DEMO_ACCOUNT_NOT_EMPTY");
	return marked;
}
