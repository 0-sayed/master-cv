import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAccountSession } from "@reactive-resume/auth/account-access";
import { lockActiveAccount } from "@reactive-resume/db/account-state";
import { withOwnerDatabase, type OwnerTransaction } from "@reactive-resume/db/owner-scope";
import { accountDataExport, privacyWork, storedFile, user } from "@reactive-resume/db/schema";
import { PrivacyEmail, privacyMailText, type PrivacyNoticeKind } from "@reactive-resume/email/templates/privacy";
import { sendPrivacyEmail } from "@reactive-resume/email/transport";
import { env } from "@reactive-resume/env/server";
import { beginOwnedFileWrite, settleOwnedFileWrite } from "../storage/ownership";
import { getStorageService } from "../storage/service";
import { collectAccountSnapshot, buildAccountArchive, exportDto } from "./export";
import { claimPrivacyWork, completePrivacyWork, liveWorkLease, retryPrivacyWork } from "./work";
const noticeSchema = z.object({
	kind: z.enum(["export_ready", "deletion_received", "deletion_complete", "security_change", "support_received"]),
	locale: z.enum(["ar-SA", "en-US"]),
	recipient: z.string(),
	actionUrl: z.string().optional(),
});
function encryptionKey() {
	if (!env.ENCRYPTION_SECRET) throw new Error("PRIVACY_ENCRYPTION_UNAVAILABLE");
	return createHash("sha256").update("privacy-notice:v1:").update(env.ENCRYPTION_SECRET).digest();
}
function seal(recipient: string, key: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	cipher.setAAD(Buffer.from(key));
	const bytes = Buffer.concat([cipher.update(recipient, "utf8"), cipher.final()]);
	return [iv, cipher.getAuthTag(), bytes].map((value) => value.toString("base64url")).join(".");
}
function unseal(value: string, key: string) {
	const parts = value.split(".");
	if (parts.length !== 3) throw new Error("PRIVACY_RECIPIENT_INVALID");
	const [iv, tag, bytes] = parts.map((part) => Buffer.from(part, "base64url"));
	if (!iv || !tag || !bytes) throw new Error("PRIVACY_RECIPIENT_INVALID");
	const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
	cipher.setAAD(Buffer.from(key));
	cipher.setAuthTag(tag);
	return Buffer.concat([cipher.update(bytes), cipher.final()]).toString("utf8");
}
export async function enqueuePrivacyNotice(
	input: {
		userId: string;
		key: string;
		kind: PrivacyNoticeKind;
		locale: string;
		recipient: string;
		actionUrl?: string;
		deferred?: boolean;
	},
	tx?: OwnerTransaction,
) {
	const recipient = z.email().max(254).parse(input.recipient);
	const payload = noticeSchema.parse({
		...input,
		locale: input.locale === "en-US" ? "en-US" : "ar-SA",
		recipient: seal(recipient, input.key),
	});
	const insert = async (connection: OwnerTransaction) => {
		await connection
			.insert(privacyWork)
			.values({
				userId: input.userId,
				kind: "send_notice",
				requestId: input.key,
				key: input.key,
				payload,
				status: input.deferred ? "blocked" : "queued",
			})
			.onConflictDoNothing();
	};
	if (tx) await insert(tx);
	else await withOwnerDatabase(input.userId, insert);
}
export async function runNoticeWork(input: { workId: string }) {
	const claim = await claimPrivacyWork({ workId: input.workId, kind: "send_notice" });
	if (!claim) return;
	try {
		const payload = noticeSchema.parse(claim.payload);
		if (payload.kind === "export_ready" || payload.kind === "security_change")
			await withOwnerDatabase(claim.userId, (tx) => lockActiveAccount(tx, claim.userId));
		await sendPrivacyEmail({
			to: unseal(payload.recipient, claim.key),
			key: claim.key,
			subject: privacyMailText(payload.kind, payload.locale),
			react: PrivacyEmail({ ...payload, appUrl: env.APP_URL }),
		});
		if (!(await completePrivacyWork(claim))) throw new Error("PRIVACY_LEASE_LOST");
	} catch (error) {
		const permanent =
			error instanceof Error && ["PRIVACY_MAIL_REJECTED", "PRIVACY_MAIL_RECIPIENT_INVALID"].includes(error.message);
		await retryPrivacyWork(claim, permanent ? "NOTICE_REJECTED" : "NOTICE_RETRY_REQUIRED", {
			terminal: permanent || claim.attempts >= 8,
		});
		throw error;
	}
}
export async function runExportWork(input: { workId: string; signal?: AbortSignal }) {
	const claim = await claimPrivacyWork({ workId: input.workId, kind: "export_account" });
	if (!claim) return;
	const key = `uploads/${claim.userId}/account-exports/${claim.requestId}/${claim.leaseToken}.zip`;
	let writing = false;
	try {
		const request = await withOwnerDatabase(claim.userId, async (tx) => {
			await lockActiveAccount(tx, claim.userId);
			const [row] = await tx
				.update(accountDataExport)
				.set({ status: "preparing", failureCode: null })
				.where(and(eq(accountDataExport.id, claim.requestId), eq(accountDataExport.userId, claim.userId)))
				.returning();
			if (!row) throw new Error("EXPORT_UNAVAILABLE");
			return row;
		});
		input.signal?.throwIfAborted();
		const snapshot = await collectAccountSnapshot({ userId: claim.userId, exportId: request.id });
		const bytes = await buildAccountArchive(snapshot);
		input.signal?.throwIfAborted();
		await beginOwnedFileWrite(claim.userId, key);
		writing = true;
		await getStorageService().write({ key, data: bytes, contentType: "application/zip", private: true });
		const digest = createHash("sha256").update(bytes).digest("hex");
		await withOwnerDatabase(claim.userId, async (tx) => {
			await lockActiveAccount(tx, claim.userId);
			const [work] = await tx
				.select({ id: privacyWork.id })
				.from(privacyWork)
				.where(liveWorkLease(claim))
				.for("update");
			if (!work) throw new Error("PRIVACY_LEASE_LOST");
			await tx.insert(storedFile).values({
				userId: claim.userId,
				key,
				purpose: "account_export",
				contentType: "application/zip",
				size: bytes.length,
				digest,
			});
			await tx
				.update(accountDataExport)
				.set({
					status: "ready",
					artifactKey: key,
					digest,
					expiresAt: new Date(Date.now() + 86400000),
					failureCode: null,
				})
				.where(eq(accountDataExport.id, request.id));
			await tx
				.insert(privacyWork)
				.values({
					userId: claim.userId,
					kind: "purge_document",
					requestId: request.id,
					key: `expire-export:${request.id}`,
					dueAt: new Date(Date.now() + 86400000),
					payload: { operation: "expire_account_export", exportId: request.id },
				})
				.onConflictDoNothing();
			const [subject] = await tx.select({ email: user.email }).from(user).where(eq(user.id, claim.userId));
			if (!subject) throw new Error("ACCOUNT_UNAVAILABLE");
			await enqueuePrivacyNotice(
				{
					userId: claim.userId,
					key: `export-ready:${request.id}`,
					kind: "export_ready",
					locale: request.locale,
					recipient: subject.email,
					actionUrl: new URL("/dashboard/settings/privacy", env.APP_URL).toString(),
				},
				tx,
			);
			if (!(await completePrivacyWork(claim, tx))) throw new Error("PRIVACY_LEASE_LOST");
		});
		await settleOwnedFileWrite(claim.userId, key, true);
		writing = false;
	} catch (error) {
		if (writing) await settleOwnedFileWrite(claim.userId, key, false);
		await withOwnerDatabase(claim.userId, async (tx) => {
			const [subject] = await tx
				.select({ pending: user.dataDeletionRequestedAt })
				.from(user)
				.where(eq(user.id, claim.userId));
			if (!subject || subject.pending) return;
			const [work] = await tx.select({ id: privacyWork.id }).from(privacyWork).where(liveWorkLease(claim));
			if (work)
				await tx
					.update(accountDataExport)
					.set({ status: "failed", failureCode: "EXPORT_RETRY_REQUIRED" })
					.where(and(eq(accountDataExport.id, claim.requestId), eq(accountDataExport.userId, claim.userId)));
		});
		await retryPrivacyWork(claim, "EXPORT_RETRY_REQUIRED");
		throw error;
	}
}
export async function getAccountExport(input: { headers: Headers; id: string }) {
	const session = await requireAccountSession(input.headers);
	return await withOwnerDatabase(session.userId, async (tx) => {
		await lockActiveAccount(tx, session.userId);
		const [row] = await tx
			.select()
			.from(accountDataExport)
			.where(and(eq(accountDataExport.id, input.id), eq(accountDataExport.userId, session.userId)));
		if (!row) throw new Error("EXPORT_UNAVAILABLE");
		if (row.status === "ready" && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
			await tx.update(accountDataExport).set({ status: "expired" }).where(eq(accountDataExport.id, row.id));
			return exportDto({ ...row, status: "expired" });
		}
		return exportDto(row);
	});
}
export async function downloadAccountExport(input: {
	headers: Headers;
	id: string;
}): Promise<{ body: ReadableStream<Uint8Array>; contentType: "application/zip"; filename: string }> {
	const session = await requireAccountSession(input.headers, { readOnly: true });
	const row = await withOwnerDatabase(session.userId, async (tx) => {
		await lockActiveAccount(tx, session.userId);
		const [request] = await tx
			.select()
			.from(accountDataExport)
			.where(and(eq(accountDataExport.id, input.id), eq(accountDataExport.userId, session.userId)));
		if (
			!request ||
			request.status !== "ready" ||
			!request.artifactKey ||
			!request.expiresAt ||
			request.expiresAt.getTime() <= Date.now()
		)
			throw new Error("EXPORT_UNAVAILABLE");
		return request;
	});
	if (!row.artifactKey) throw new Error("EXPORT_UNAVAILABLE");
	const file = await getStorageService().read(row.artifactKey);
	if (!file || createHash("sha256").update(file.data).digest("hex") !== row.digest)
		throw new Error("EXPORT_UNAVAILABLE");
	await withOwnerDatabase(session.userId, (tx) => lockActiveAccount(tx, session.userId));
	return {
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(file.data);
				controller.close();
			},
		}),
		contentType: "application/zip",
		filename: "account-data.zip",
	};
}

export async function runExportExpiryWork(input: { workId: string }) {
	const claim = await claimPrivacyWork({ workId: input.workId, kind: "purge_document" });
	if (!claim) return;
	try {
		const request = await withOwnerDatabase(claim.userId, async (tx) => {
			const [row] = await tx
				.select()
				.from(accountDataExport)
				.where(and(eq(accountDataExport.id, claim.requestId), eq(accountDataExport.userId, claim.userId)));
			if (!row) return null;
			if (row.expiresAt && row.expiresAt.getTime() > Date.now()) throw new Error("EXPORT_NOT_EXPIRED");
			await tx.update(accountDataExport).set({ status: "expired" }).where(eq(accountDataExport.id, row.id));
			if (row.artifactKey)
				await tx
					.update(storedFile)
					.set({ revokedAt: new Date() })
					.where(and(eq(storedFile.userId, claim.userId), eq(storedFile.key, row.artifactKey)));
			return row;
		});
		if (request?.artifactKey) await getStorageService().delete(request.artifactKey);
		await withOwnerDatabase(claim.userId, async (tx) => {
			if (!(await completePrivacyWork(claim, tx))) throw new Error("PRIVACY_LEASE_LOST");
			if (request?.artifactKey) {
				await tx
					.delete(storedFile)
					.where(and(eq(storedFile.userId, claim.userId), eq(storedFile.key, request.artifactKey)));
				await tx
					.update(accountDataExport)
					.set({ artifactKey: null, digest: null })
					.where(eq(accountDataExport.id, request.id));
			}
		});
	} catch (error) {
		await retryPrivacyWork(claim, "EXPORT_EXPIRY_RETRY_REQUIRED");
		throw error;
	}
}
