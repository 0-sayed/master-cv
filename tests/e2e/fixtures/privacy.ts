import type { Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { expect } from "./test";
/** Direct fixture setup is confined to the runner's disposable database and local storage. */
export async function privacyDatabase<T>(work: (pool: Pool) => Promise<T>) {
	const value = process.env.DATABASE_MIGRATION_URL;
	if (!value) throw new Error("Disposable runner database required");
	const url = new URL(value);
	if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432")
		throw new Error("Designated disposable PostgreSQL required");
	const pool = new Pool({ connectionString: value });
	try {
		return await work(pool);
	} finally {
		await pool.end();
	}
}
export async function privacyPost(page: Page, path: string, data: unknown) {
	const origin = new URL(page.url()).origin;
	const response = await page.request.post(`/api/openapi/privacy/${path}`, { headers: { origin }, data });
	await expect(response).toBeOK();
	return await response.json();
}
async function accountProof(page: Page, password: string, action: "export_account" | "delete_account") {
	const requestNonce = randomUUID();
	const challenge = await privacyPost(page, "proof/begin", { action, requestNonce });
	const proof = await privacyPost(page, "proof/verify", {
		challengeId: challenge.challengeId,
		credential: { method: "password", password },
	});
	return { requestNonce, proofToken: proof.token };
}
export async function seedPrivacyAccount(
	input: {
		locale: "ar-SA" | "en-US";
		state: "active" | "export_ready" | "deletion_requested";
		includeQueuedWork: boolean;
	},
	context: { page: Page; password: string },
) {
	const { page } = context;
	await page.goto("/dashboard/settings/privacy");
	await page.context().addCookies([{ name: "locale", value: input.locale, url: new URL(page.url()).origin }]);
	const auth = await page.request.get("/api/auth/get-session");
	await expect(auth).toBeOK();
	const { user } = await auth.json();
	const response = await page.request.post("/api/openapi/resumes", {
		data: { name: "Synthetic lifecycle CV", tags: [], withSampleData: true },
	});
	await expect(response).toBeOK();
	const documentId: string = await response.json();
	const key = `uploads/${user.id}/originals/sentinel.txt`;
	const bytes = Buffer.from("SYNTHETIC_ATTACHMENT_SENTINEL");
	const directory = process.env.LOCAL_STORAGE_PATH;
	if (!directory) throw new Error("Runner local storage required");
	await mkdir(join(directory, `uploads/${user.id}/originals`), { recursive: true });
	await writeFile(join(directory, key), bytes);
	await privacyDatabase(async (pool) => {
		await pool.query('UPDATE "user" SET ui_locale=$1 WHERE id=$2', [input.locale, user.id]);
		await pool.query(
			"INSERT INTO stored_file(id,user_id,key,purpose,content_type,size,digest) VALUES (gen_random_uuid()::text,$1,$2,'original','text/plain',$3,$4)",
			[user.id, key, bytes.length, createHash("sha256").update(bytes).digest("hex")],
		);
		await pool.query(
			"INSERT INTO resume_version(id,user_id,resume_id,name,data) SELECT gen_random_uuid()::text,user_id,id,'SYNTHETIC_REVISION_SENTINEL',data FROM resume WHERE id=$1",
			[documentId],
		);
		if (input.includeQueuedWork) {
			await pool.query(
				"INSERT INTO privacy_work(id,user_id,kind,request_id,key,due_at,payload) VALUES (gen_random_uuid()::text,$1,'send_notice',$2,$2,now()+interval '1 hour','{}')",
				[user.id, randomUUID()],
			);
			for (const state of ["queued", "running"]) {
				const id = randomUUID();
				await pool.query(
					"INSERT INTO ai_operation(id,user_id,request_key,fingerprint,kind,sources,route,consent_version,prompt_version,schema_version,state,due_at,deadline_at,lease_token,lease_until) VALUES ($1,$2,$1,'synthetic-browser','import','[]','{\"routeId\":\"synthetic-browser\",\"routeRevision\":\"1\",\"configRevision\":\"1\"}','1','1','1',$3,now()+interval '1 hour',now()+interval '2 hours',$4,now()+interval '10 minutes')",
					[id, user.id, state, state === "running" ? "synthetic-held-lease" : null],
				);
			}
		}
	});
	let requestId: string | undefined;
	if (input.state === "export_ready") {
		const proof = await accountProof(page, context.password, "export_account");
		const request = await privacyPost(page, "export", proof);
		requestId = request.id;
		await expect
			.poll(async () => (await privacyPost(page, "export/status", { id: request.id })).status, { timeout: 30000 })
			.toBe("ready");
	}
	if (input.state === "deletion_requested") {
		const proof = await accountProof(page, context.password, "delete_account");
		requestId = (await privacyPost(page, "deletion", { ...proof, confirmed: true })).requestId;
	}
	return { userId: user.id as string, documentId, key, requestId };
}
