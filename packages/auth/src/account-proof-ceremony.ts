import type { PasskeyOptions } from "@better-auth/passkey";
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";
import { db } from "@reactive-resume/db/client";
import { passkey } from "@reactive-resume/db/schema";

export const proofPasskeyCeremony = new AsyncLocalStorage<{ userId: string; verified: boolean }>();
/** Ordinary login remains ordinary login; only the server wrapper can establish this context. */
export const verifyProofPasskey: NonNullable<
	NonNullable<PasskeyOptions["authentication"]>["afterVerification"]
> = async ({ verification, clientData }) => {
	const ceremony = proofPasskeyCeremony.getStore();
	if (!ceremony) return;
	if (!verification.authenticationInfo.userVerified) throw new Error("PASSKEY_USER_VERIFICATION_REQUIRED");
	const [credential] = await db
		.select({ id: passkey.id })
		.from(passkey)
		.where(and(eq(passkey.userId, ceremony.userId), eq(passkey.credentialID, clientData.id)));
	if (!credential) throw new Error("PASSKEY_OWNER_MISMATCH");
	ceremony.verified = true;
};
