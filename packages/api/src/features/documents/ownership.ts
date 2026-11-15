import type { DbOrTx } from "@reactive-resume/db/client";
import { ORPCError } from "@orpc/client";
import { lockActiveAccount } from "@reactive-resume/db/account-state";

/** Match application submission's owner-first order before document/application FK writes. */
export async function lockDocumentOwner(tx: DbOrTx, userId: string) {
	try {
		await lockActiveAccount(tx, userId);
	} catch (error) {
		if (error instanceof Error && error.message === "ACCOUNT_UNAVAILABLE") throw new ORPCError("NOT_FOUND");
		if (error instanceof Error && error.message === "ACCOUNT_DELETION_PENDING")
			throw new ORPCError("FORBIDDEN", { message: "ACCOUNT_DELETION_PENDING" });
		throw error;
	}
}
