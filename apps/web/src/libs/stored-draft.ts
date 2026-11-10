import type { RegisteredStorageKey } from "./browser-storage";
import z from "zod";
import { browserStorage } from "./browser-storage";
const envelopeSchema = z.object({
	version: z.literal(1),
	ownerId: z.string(),
	documentId: z.string(),
	baseRevision: z.string(),
	expiresAt: z.number().finite(),
	value: z.unknown(),
});
export type DraftIdentity = { ownerId: string; documentId: string; baseRevision: string };
export type StoredDraft<T> = DraftIdentity & { version: 1; expiresAt: number; value: T };
const DRAFT_RETENTION_MS = 24 * 60 * 60 * 1000;
export function readStoredDraft<T>(
	area: "local" | "session",
	key: RegisteredStorageKey,
	identity: DraftIdentity,
	parse: (value: unknown) => T | undefined,
): StoredDraft<T> | undefined {
	try {
		const raw = browserStorage[area].getItem(key);
		if (!raw) return;
		const envelope = envelopeSchema.safeParse(JSON.parse(raw));
		const data = envelope.success ? envelope.data : undefined;
		const value = data ? parse(data.value) : undefined;
		if (
			!data ||
			value === undefined ||
			data.ownerId !== identity.ownerId ||
			data.documentId !== identity.documentId ||
			data.expiresAt <= Date.now()
		) {
			browserStorage[area].removeItem(key);
			return;
		}
		return { ...data, value };
	} catch {
		return;
	}
}
export function writeStoredDraft<T>(
	area: "local" | "session",
	key: RegisteredStorageKey,
	identity: DraftIdentity,
	value: T,
) {
	try {
		browserStorage[area].setItem(
			key,
			JSON.stringify({
				...identity,
				version: 1,
				expiresAt: Date.now() + DRAFT_RETENTION_MS,
				value,
			} satisfies StoredDraft<T>),
		);
	} catch {
		/* The live draft remains usable when storage is blocked. */
	}
}
export function removeStoredDraft(area: "local" | "session", key: RegisteredStorageKey) {
	try {
		browserStorage[area].removeItem(key);
	} catch {
		/* Storage may be blocked. */
	}
}
