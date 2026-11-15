import type { DbOrTx } from "./client";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { user } from "./schema/auth";

function requireActive(account: { dataDeletionRequestedAt: Date | null } | undefined): void {
	if (!account) throw new Error("ACCOUNT_UNAVAILABLE");
	if (account.dataDeletionRequestedAt) throw new Error("ACCOUNT_DELETION_PENDING");
}

/** Owner-first row lock must remain held until the personal write commits. */
export async function lockActiveAccount(tx: DbOrTx, userId: string): Promise<void> {
	const [account] = await tx
		.select({ dataDeletionRequestedAt: user.dataDeletionRequestedAt })
		.from(user)
		.where(eq(user.id, userId))
		.for("update");
	requireActive(account);
}

/** Read guard only; mutations must use lockActiveAccount in their transaction. */
export async function assertAccountActive(userId: string): Promise<void> {
	const [account] = await db
		.select({ dataDeletionRequestedAt: user.dataDeletionRequestedAt })
		.from(user)
		.where(eq(user.id, userId));
	requireActive(account);
}

/** Accounting may finish after admission closes, but must never publish personal output. */
export async function lockAccountForAccounting(tx: DbOrTx, userId: string) {
	const [account] = await tx
		.select({ dataDeletionRequestedAt: user.dataDeletionRequestedAt })
		.from(user)
		.where(eq(user.id, userId))
		.for("update");
	return account ? { deleting: account.dataDeletionRequestedAt !== null } : null;
}
