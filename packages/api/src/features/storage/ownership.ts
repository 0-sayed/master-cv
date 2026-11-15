import { createHash } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { lockActiveAccount } from "@reactive-resume/db/account-state";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import { storedFile, privacyWork } from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { getStorageService } from "./service";
function checkKey(userId: string, key: string) {
	if (
		!key.startsWith(`uploads/${userId}/`) ||
		key.includes("\\") ||
		key.split("/").some((part) => !part || part === "." || part === "..")
	)
		throw new Error("FILE_OWNER_DENIED");
}
/** Persist before egress. A crash with an unsettled write blocks erasure until reconciled. */
export async function beginOwnedFileWrite(userId: string, key: string) {
	checkKey(userId, key);
	await withOwnerDatabase(userId, async (tx) => {
		await lockActiveAccount(tx, userId);
		await tx.insert(privacyWork).values({
			userId,
			kind: "purge_document",
			requestId: key,
			key: `file-write:${key}`,
			status: "blocked",
			payload: { operation: "remove_unregistered_file", key, ioPending: true },
		});
	});
}
export async function settleOwnedFileWrite(userId: string, key: string, published: boolean) {
	if (!published) {
		try {
			await getStorageService().delete(key);
		} catch {
			await withOwnerDatabase(userId, (tx) =>
				tx
					.update(privacyWork)
					.set({ status: "queued", payload: { operation: "remove_unregistered_file", key, ioPending: false } })
					.where(and(eq(privacyWork.userId, userId), eq(privacyWork.key, `file-write:${key}`))),
			);
			return;
		}
	}
	await withOwnerDatabase(userId, (tx) =>
		tx
			.update(privacyWork)
			.set({ status: "complete", completedAt: new Date(), payload: null })
			.where(and(eq(privacyWork.userId, userId), eq(privacyWork.key, `file-write:${key}`))),
	);
}
export async function registerOwnedFile(input: {
	userId: string;
	key: string;
	purpose: string;
	contentType: string;
	size: number;
	digest: string;
}) {
	checkKey(input.userId, input.key);
	return await withOwnerDatabase(input.userId, async (tx) => {
		await lockActiveAccount(tx, input.userId);
		const [existing] = await tx.select().from(storedFile).where(eq(storedFile.key, input.key));
		if (
			existing &&
			(existing.revokedAt ||
				existing.digest !== input.digest ||
				existing.size !== input.size ||
				existing.contentType !== input.contentType ||
				existing.purpose !== input.purpose)
		)
			throw new Error("FILE_REGISTRATION_CONFLICT");
		const [created] = existing
			? [existing]
			: await tx
					.insert(storedFile)
					.values({ ...input, visibility: "private" })
					.returning();
		if (!created) throw new Error("FILE_REGISTRATION_FAILED");
		return {
			id: created.id,
			generation: created.generation,
			url: new URL(`/api/${input.key}`, env.APP_URL).toString(),
		};
	});
}
export async function authorizeOwnedFile(input: { userId: string; key: string; generation?: number }) {
	checkKey(input.userId, input.key);
	const lookup = () =>
		withOwnerDatabase(input.userId, async (tx) => {
			await lockActiveAccount(tx, input.userId);
			const [file] = await tx
				.select()
				.from(storedFile)
				.where(
					and(
						eq(storedFile.userId, input.userId),
						eq(storedFile.key, input.key),
						eq(storedFile.visibility, "private"),
						isNull(storedFile.revokedAt),
					),
				);
			return file;
		});
	let file = await lookup();
	if (!file) {
		await backfillOwnedPictures({ userId: input.userId, key: input.key });
		file = await lookup();
	}
	if (!file || (input.generation !== undefined && file.generation !== input.generation))
		throw new Error("FILE_UNAVAILABLE");
	return file;
}
export async function revokeOwnedFile(input: { userId: string; id: string }) {
	await withOwnerDatabase(input.userId, async (tx) => {
		await lockActiveAccount(tx, input.userId);
		await tx
			.update(storedFile)
			.set({ revokedAt: new Date() })
			.where(and(eq(storedFile.userId, input.userId), eq(storedFile.id, input.id), isNull(storedFile.revokedAt)));
	});
}
/** The tombstone denies delivery immediately; durable cleanup survives a failed delete or restart. */
export async function deleteOwnedFile(input: { userId: string; key: string }) {
	checkKey(input.userId, input.key);
	await withOwnerDatabase(input.userId, async (tx) => {
		await lockActiveAccount(tx, input.userId);
		const [file] = await tx
			.update(storedFile)
			.set({ revokedAt: new Date(), purpose: "deleted" })
			.where(and(eq(storedFile.userId, input.userId), eq(storedFile.key, input.key)))
			.returning();
		if (!file) throw new Error("FILE_UNAVAILABLE");
		await tx
			.insert(privacyWork)
			.values({
				userId: input.userId,
				kind: "purge_document",
				requestId: input.key,
				key: `file-delete:${file.id}`,
				payload: { operation: "remove_unregistered_file", key: input.key },
			})
			.onConflictDoNothing();
	});
}

/** Internal operator/adapter seam, never an HTTP action. Expiry alone cannot establish settlement. */
export async function reconcileOwnedFileWrite(input: {
	userId: string;
	key: string;
	confirmSettled: (write: { key: string; startedAt: Date }) => Promise<"settled" | "pending">;
}) {
	checkKey(input.userId, input.key);
	const [work] = await withOwnerDatabase(input.userId, (tx) =>
		tx
			.select()
			.from(privacyWork)
			.where(and(eq(privacyWork.userId, input.userId), eq(privacyWork.key, `file-write:${input.key}`))),
	);
	if (!work || work.status !== "blocked" || work.payload?.ioPending !== true) return "not_pending";
	if ((await input.confirmSettled({ key: input.key, startedAt: work.createdAt })) !== "settled") return "pending";
	const [published] = await withOwnerDatabase(input.userId, (tx) =>
		tx
			.select({ id: storedFile.id })
			.from(storedFile)
			.where(and(eq(storedFile.userId, input.userId), eq(storedFile.key, input.key), isNull(storedFile.revokedAt))),
	);
	await settleOwnedFileWrite(input.userId, input.key, !!published);
	return "reconciled";
}
export async function readOwnedPicture(input: { userId: string; key: string }) {
	const file = await authorizeOwnedFile(input);
	if (file.purpose !== "picture" || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.contentType))
		throw new Error("PICTURE_UNAVAILABLE");
	const stored = await getStorageService().read(input.key);
	if (!stored || stored.size !== file.size || createHash("sha256").update(stored.data).digest("hex") !== file.digest)
		throw new Error("PICTURE_UNAVAILABLE");
	return stored.data;
}

/** Explicit, bounded legacy reconciliation; unknown/orphan objects remain undeliverable. */
async function backfillOwnedPictures(input: { userId: string; limit?: number; key?: string }) {
	const { user, resume } = await import("@reactive-resume/db/schema");
	const limit = Math.min(100, Math.max(1, input.limit ?? 25));
	const references = await withOwnerDatabase(input.userId, async (tx) => {
		await lockActiveAccount(tx, input.userId);
		const [owner] = await tx.select({ image: user.image }).from(user).where(eq(user.id, input.userId));
		const resumes = await tx
			.select({ url: resume.data })
			.from(resume)
			.where(
				and(
					eq(resume.userId, input.userId),
					input.key
						? sql`${resume.data}#>>'{picture,url}' IN (${new URL(`/api/${input.key}`, env.APP_URL).toString()}, ${new URL(`/${input.key}`, env.APP_URL).toString()})`
						: undefined,
				),
			)
			.limit(limit);
		return [owner?.image, ...resumes.map((row) => row.url.picture.url)]
			.filter((value): value is string => !!value)
			.slice(0, limit);
	});
	let registered = 0;
	for (const reference of new Set(references)) {
		let url: URL;
		try {
			url = new URL(reference);
		} catch {
			continue;
		}
		if (url.origin !== new URL(env.APP_URL).origin || url.search || url.hash || url.username || url.password) continue;
		const key = url.pathname.replace(/^\/api\//, "");
		if (input.key && key !== input.key) continue;
		try {
			checkKey(input.userId, key);
		} catch {
			continue;
		}
		if (!/^uploads\/[^/]+\/pictures\/[^/]+\.(?:png|jpe?g|webp|gif)$/.test(key)) continue;
		const known = await withOwnerDatabase(input.userId, (tx) =>
			tx.select({ id: storedFile.id }).from(storedFile).where(eq(storedFile.key, key)),
		);
		if (known.length) continue;
		const file = await getStorageService().read(key);
		if (!file) continue;
		const { inferContentType } = await import("./service");
		await registerOwnedFile({
			userId: input.userId,
			key,
			purpose: "picture",
			contentType: inferContentType(key),
			size: file.data.byteLength,
			digest: createHash("sha256").update(file.data).digest("hex"),
		});
		registered++;
	}
	return registered;
}
