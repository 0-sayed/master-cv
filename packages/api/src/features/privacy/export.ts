import type { ExportRequest } from "./contracts";
import type { DataClassification } from "./inventory";
import type { InferSelectModel } from "drizzle-orm";
import type { PgTable, AnyPgColumn } from "drizzle-orm/pg-core";
import { createHash } from "node:crypto";
import { eq, getTableColumns, type SQL } from "drizzle-orm";
import { Zip, ZipPassThrough, strToU8 } from "fflate";
import { z } from "zod";
import { consumeFreshProof, requireAccountSession } from "@reactive-resume/auth/account-access";
import { lockActiveAccount } from "@reactive-resume/db/account-state";
import { db, withDatabaseOwner } from "@reactive-resume/db/client";
import { withOwnerDatabase } from "@reactive-resume/db/owner-scope";
import * as schema from "@reactive-resume/db/schema";
import { env } from "@reactive-resume/env/server";
import { getStorageService } from "../storage/service";
import { assertPersonalDataInventory, inventoryTable, ownerSelector, personalDataInventory } from "./inventory";
const formatVersion = z.literal(1);
type Inventory = typeof personalDataInventory;
type TableFor<K extends keyof Inventory> = (typeof schema)[Inventory[K]["table"]];
type SafeRow<K extends keyof Inventory> =
	TableFor<K> extends PgTable
		? Pick<
				InferSelectModel<TableFor<K>>,
				Extract<Inventory[K]["exportColumns"][number], keyof InferSelectModel<TableFor<K>>>
			>
		: never;
export type AccountSnapshotV1 = {
	version: 1;
	exportedAt: string;
	exportId: string;
	subject: { id: string; name: string; email: string };
	categories: { [K in keyof Inventory]: SafeRow<K>[] };
	files: { key: string; path: string; size: number | null; digest: string | null }[];
	unavailable: { category: string; reason: "NOT_RETAINED" }[];
};
const maxBytes = 128 * 1024 * 1024;
const maxFiles = 10_000;
export function exportDto(row: typeof schema.accountDataExport.$inferSelect): ExportRequest {
	return {
		id: row.id,
		status: row.status as ExportRequest["status"],
		requestedAt: row.requestedAt.toISOString(),
		expiresAt: row.expiresAt?.toISOString() ?? null,
		failureCode: row.failureCode,
	};
}
export async function requestAccountExport(input: {
	headers: Headers;
	proofToken: string;
	requestNonce: string;
}): Promise<ExportRequest> {
	const session = await requireAccountSession(input.headers);
	return await withOwnerDatabase(session.userId, async (tx) => {
		await consumeFreshProof(tx, {
			headers: input.headers,
			token: input.proofToken,
			action: "export_account",
			requestNonce: input.requestNonce,
		});
		const [subject] = await tx
			.select({ locale: schema.user.uiLocale })
			.from(schema.user)
			.where(eq(schema.user.id, session.userId));
		const [row] = await tx
			.insert(schema.accountDataExport)
			.values({ userId: session.userId, requestNonce: input.requestNonce, locale: subject?.locale ?? "ar-SA" })
			.returning();
		if (!row) throw new Error("EXPORT_REQUEST_UNAVAILABLE");
		await tx
			.insert(schema.privacyWork)
			.values({ userId: session.userId, kind: "export_account", requestId: row.id, key: `export:${row.id}` });
		return exportDto(row);
	});
}
/** Database snapshot closes before listing/reading any storage object. */
export async function collectAccountSnapshot(input: { userId: string; exportId: string }): Promise<AccountSnapshotV1> {
	assertPersonalDataInventory();
	const snapshot = await withDatabaseOwner(input.userId, () =>
		db.transaction(
			async (tx) => {
				await lockActiveAccount(tx, input.userId);
				const [subject] = await tx
					.select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
					.from(schema.user)
					.where(eq(schema.user.id, input.userId));
				if (!subject) throw new Error("ACCOUNT_UNAVAILABLE");
				const categories: Record<string, unknown[]> = {};
				for (const [name, policy] of Object.entries(personalDataInventory) as [keyof Inventory, DataClassification][]) {
					categories[name] = [];
					if (policy.owner === "global" || policy.owner === "restricted") continue;
					const table = inventoryTable(policy);
					const columns = getTableColumns(table);
					const projection = Object.fromEntries(policy.exportColumns.map((key) => [key, columns[key]])) as Record<
						string,
						AnyPgColumn | SQL
					>;
					categories[name] = await tx.select(projection).from(table).where(ownerSelector(policy, input.userId));
				}
				const registered = await tx.select().from(schema.storedFile).where(eq(schema.storedFile.userId, input.userId));
				const archives = await tx
					.select({ key: schema.accountDataExport.artifactKey })
					.from(schema.accountDataExport)
					.where(eq(schema.accountDataExport.userId, input.userId));
				return {
					version: formatVersion.parse(1),
					exportId: input.exportId,
					exportedAt: new Date().toISOString(),
					subject,
					categories: categories as AccountSnapshotV1["categories"],
					files: [],
					unavailable: [],
					registered,
					archives,
				};
			},
			{ isolationLevel: "repeatable read" },
		),
	);
	const scope = `uploads/${input.userId}/`;
	const excluded = new Set(snapshot.archives.map((item) => item.key).filter(Boolean));
	const references = [
		...snapshot.categories.agent_attachments.map((item) => item.storageKey),
		...snapshot.categories.application.flatMap((item) => [item.resumeFileUrl, item.coverLetterUrl]),
		...snapshot.categories.resume.map((item) => item.data.picture?.url),
	];
	const knownKeys = references.flatMap((value) => {
		if (!value) return [];
		if (value.startsWith(scope)) return [value];
		try {
			const url = new URL(value, env.APP_URL);
			return url.origin === new URL(env.APP_URL).origin &&
				!url.search &&
				!url.hash &&
				url.pathname.startsWith(`/api/${scope}`)
				? [url.pathname.slice(5)]
				: [];
		} catch {
			return [];
		}
	});
	const keys = new Set([
		...(await getStorageService().list(scope)),
		...snapshot.registered.map((item) => item.key),
		...knownKeys,
	]);
	if (keys.size > maxFiles) throw new Error("EXPORT_TOO_LARGE");
	const files: AccountSnapshotV1["files"] = [];
	for (const key of [...keys].sort()) {
		if (
			!key.startsWith(scope) ||
			key.includes("\\") ||
			key
				.slice(scope.length)
				.split("/")
				.some((part) => !part || part === "." || part === "..")
		)
			throw new Error("EXPORT_FILE_SCOPE");
		const record = snapshot.registered.find((item) => item.key === key);
		if (
			excluded.has(key) ||
			record?.purpose === "account_export" ||
			record?.purpose === "deleted" ||
			key.startsWith(`${scope}account-exports/`)
		)
			continue;
		files.push({
			key,
			path: `files/${key.slice(scope.length)}`,
			size: record?.size ?? null,
			digest: record?.digest ?? null,
		});
	}
	const { registered: _registered, archives: _archives, ...result } = snapshot;
	return { ...result, files };
}
const secretField =
	/^(password|passwordhash|secret|backupcodes|authorization|cookie|set-cookie|accesstoken|refreshtoken|idtoken|apikey|encryptedapikey|token|leasetoken|challenge|credentialid|privatekey)$/i;
function sanitize(value: unknown, snapshot: AccountSnapshotV1): unknown {
	if (Array.isArray(value)) return value.map((item) => sanitize(item, snapshot));
	if (value instanceof Date) return value.toISOString();
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !secretField.test(key.replaceAll("_", "")))
				.map(([key, item]) => [key, sanitize(item, snapshot)]),
		);
	if (typeof value !== "string") return value;
	const text = value.replace(/\b(authorization\s*:\s*(?:Bearer|Basic)\s+)\S+/gi, "$1[redacted]");
	const file = snapshot.files.find(
		(item) =>
			text === item.key ||
			text === `${env.APP_URL}/api/${item.key}` ||
			text === `${env.APP_URL}/${item.key}` ||
			text === `/${item.key}`,
	);
	if (file) return file.path;
	try {
		const url = new URL(text);
		if (url.origin === new URL(env.APP_URL).origin && /^\/(?:api\/)?uploads\//.test(url.pathname)) return null;
		if (url.username || url.password || [...url.searchParams.keys()].some((key) => secretField.test(key)))
			return "[private URL omitted]";
	} catch {
		/* Ordinary saved content is not a URL. */
	}
	return text;
}
/** Streaming ZIP entries with explicit process-memory bounds; never fetches remote references. */
export async function buildAccountArchive(snapshot: AccountSnapshotV1): Promise<Uint8Array> {
	const files: Record<string, Uint8Array> = {};
	let total = 0;
	for (const file of snapshot.files) {
		const object = await getStorageService().read(file.key);
		if (!object) throw new Error("EXPORT_FILE_MISSING");
		total += object.data.byteLength;
		if (total > maxBytes) throw new Error("EXPORT_TOO_LARGE");
		const digest = createHash("sha256").update(object.data).digest("hex");
		if ((file.digest && file.digest !== digest) || (file.size !== null && file.size !== object.data.byteLength))
			throw new Error("EXPORT_FILE_CHANGED");
		file.digest = digest;
		file.size = object.data.byteLength;
		files[file.path] = object.data;
	}
	const delivered = { ...snapshot, files: snapshot.files.map(({ key: _key, ...file }) => file) };
	files["account.json"] = strToU8(JSON.stringify(sanitize(delivered, snapshot), null, 2));
	total += files["account.json"].length;
	if (total > maxBytes) throw new Error("EXPORT_TOO_LARGE");
	return await new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		let length = 0;
		const zip = new Zip((error, chunk, final) => {
			if (error) {
				reject(error);
				return;
			}
			length += chunk.length;
			if (length > maxBytes + 1024 * 1024) {
				reject(new Error("EXPORT_TOO_LARGE"));
				return;
			}
			chunks.push(chunk);
			if (final) {
				const result = new Uint8Array(length);
				let offset = 0;
				for (const part of chunks) {
					result.set(part, offset);
					offset += part.length;
				}
				resolve(result);
			}
		});
		for (const [path, bytes] of Object.entries(files)) {
			const entry = new ZipPassThrough(path);
			zip.add(entry);
			entry.push(bytes, true);
		}
		zip.end();
	});
}
