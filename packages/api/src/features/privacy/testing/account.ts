import type { privacyTestDatabase } from "./database";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { beginFreshProof, verifyFreshProof } from "@reactive-resume/auth/account-access";
import { auth } from "@reactive-resume/auth/config";
export async function syntheticAccountSession(
	database: ReturnType<typeof privacyTestDatabase>,
	userId: "alice" | "bob" = "alice",
) {
	const password = "Synthetic-Account-123";
	await database.admin().query('UPDATE "user" SET email_verified=true WHERE id=$1', [userId]);
	await database
		.admin()
		.query("INSERT INTO account(id,user_id,account_id,provider_id,password) VALUES ($1,$2,$2,'credential',$3)", [
			randomUUID(),
			userId,
			await hash(password, 4),
		]);
	const login = await database.run(() =>
		auth.handler(
			new Request("http://localhost:3030/api/auth/sign-in/email", {
				method: "POST",
				headers: { origin: "http://localhost:3030", "content-type": "application/json" },
				body: JSON.stringify({ email: `${userId}@example.test`, password }),
			}),
		),
	);
	if (login.status !== 200) throw new Error("Synthetic login failed");
	const headers = new Headers({
		origin: "http://localhost:3030",
		cookie: login.headers
			.getSetCookie()
			.map((value) => value.split(";", 1)[0])
			.join("; "),
	});
	return {
		headers,
		proof: async (action: "export_account" | "delete_account") => {
			const requestNonce = randomUUID();
			const challenge = await database.run(() => beginFreshProof({ headers, action, requestNonce }));
			const proof = await database.run(() =>
				verifyFreshProof({ headers, challengeId: challenge.challengeId, credential: { method: "password", password } }),
			);
			return { proofToken: proof.token, requestNonce };
		},
	};
}
