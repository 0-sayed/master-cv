import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vite-plus/test";
import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { requestEmailChange, verifyEmailChange, getAccountSecurityState } from "@reactive-resume/auth/account-changes";
import { db } from "@reactive-resume/db/client";
import { user } from "@reactive-resume/db/schema";
import { privacyRouter } from "./router";
import { syntheticAccountSession } from "./testing/account";
import { privacyTestDatabase } from "./testing/database";

// Always the loopback-only SMTP sink. Never consult host SMTP credentials or send real mail.
vi.hoisted(() => {
	Object.assign(process.env, {
		SMTP_HOST: "127.0.0.1",
		SMTP_PORT: "33035",
		SMTP_USER: "synthetic",
		SMTP_PASS: "synthetic",
		SMTP_FROM: "security@example.test",
		SMTP_SECURE: "false",
	});
});
const database = privacyTestDatabase();
let directory: string;
let sink: ReturnType<typeof spawn>;
beforeAll(async () => {
	directory = await mkdtemp(join(tmpdir(), "email-change-mail-"));
	sink = spawn(process.execPath, [new URL("../../../../../tests/e2e/mail-capture.mjs", import.meta.url).pathname], {
		env: { PATH: process.env.PATH, E2E_MAIL_DIRECTORY: directory, E2E_SMTP_PORT: "33035" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (!sink.stdout) throw new Error("Synthetic SMTP output missing");
	await Promise.race([
		once(sink.stdout, "data"),
		once(sink, "exit").then(() => {
			throw new Error("Synthetic SMTP failed to start");
		}),
	]);
});
afterAll(async () => {
	sink?.kill("SIGTERM");
	if (sink && sink.exitCode === null) await once(sink, "exit");
	if (directory) await rm(directory, { recursive: true, force: true });
});
async function captured() {
	const files = (await readdir(directory)).filter((file) => file.endsWith(".json"));
	return Promise.all(
		files.map(
			async (file) => JSON.parse(await readFile(join(directory, file), "utf8")) as { recipient: string; raw: string },
		),
	);
}
function tokenOf(raw: string) {
	// SMTP quoted-printable soft wraps and HTML escaping are transport, not capability content.
	const text = raw.replace(/=\r\n/g, "").replace(/=3D/g, "=").replace(/&amp;/g, "&");
	const url = text.match(/http:\/\/localhost:3030\/api\/auth\/confirm-email-change\?token=([\w.-]+)/)?.[0];
	if (!url) throw new Error("Captured email-change link missing");
	const token = new URL(url).searchParams.get("token");
	if (!token) throw new Error("Captured capability missing");
	return token;
}
it("captures both steps, rolls back a failed send, and keeps duplicate approvals truthful", async () => {
	const session = await syntheticAccountSession(database);
	const [owner] = await database.run(() => db.select().from(user).where(eq(user.id, "alice")));
	if (!owner) throw new Error("Synthetic account missing");
	const client = createRouterClient(privacyRouter, {
		context: {
			locale: "en-US",
			reqHeaders: session.headers,
			authentication: { user: owner, method: "session", permissions: ["read", "write", "delete"] },
		},
	});
	await database.run(() =>
		requestEmailChange({
			headers: session.headers,
			newEmail: "new-owner@example.test",
			requestNonce: "captured-mail",
			credential: { method: "password", password: "Synthetic-Account-123" },
		}),
	);
	const [first] = await captured();
	expect(first?.recipient).toBe("alice@example.test");
	if (!first) throw new Error("Old-address email missing");
	const token = tokenOf(first.raw);
	await writeFile(join(directory, "transport-state"), "offline");
	await expect(database.run(() => verifyEmailChange(token))).rejects.toThrow("EMAIL_CHANGE_DELIVERY_FAILED");
	expect(await database.run(() => client.security())).toMatchObject({
		pendingEmail: { stage: "confirm_old", confirmationAddress: "alice@example.test" },
	});
	await writeFile(join(directory, "transport-state"), "online");
	expect(
		await Promise.all([database.run(() => verifyEmailChange(token)), database.run(() => verifyEmailChange(token))]),
	).toEqual([{ status: "verification_sent" }, { status: "verification_sent" }]);
	const mails = await captured();
	expect(mails).toHaveLength(2);
	const second = mails.find((mail) => mail.recipient === "new-owner@example.test");
	expect(second).toBeDefined();
	if (!second) throw new Error("New-address email missing");
	expect(await database.run(() => client.security())).toMatchObject({
		pendingEmail: { stage: "verify_new", confirmationAddress: "new-owner@example.test" },
	});
	expect(await database.run(() => verifyEmailChange(tokenOf(second.raw)))).toEqual({ status: "complete" });
	expect(await database.run(() => verifyEmailChange(token))).toEqual({ status: "complete" });
});
it("a non-test destination is rejected by the synthetic sink without consuming approval", async () => {
	const session = await syntheticAccountSession(database, "bob");
	await database.run(() =>
		requestEmailChange({
			headers: session.headers,
			newEmail: "owner@example.invalid",
			requestNonce: "sink-recipient-rejection",
			credential: { method: "password", password: "Synthetic-Account-123" },
		}),
	);
	const first = (await captured()).find((mail) => mail.recipient === "bob@example.test");
	if (!first) throw new Error("Old-address email missing");
	await expect(database.run(() => verifyEmailChange(tokenOf(first.raw)))).rejects.toThrow(
		"EMAIL_CHANGE_DELIVERY_FAILED",
	);
	expect(await database.run(() => getAccountSecurityState(session.headers))).toMatchObject({
		pendingEmail: { stage: "confirm_old", confirmationAddress: "bob@example.test" },
	});
	expect((await captured()).some((mail) => mail.recipient === "owner@example.invalid")).toBe(false);
});
