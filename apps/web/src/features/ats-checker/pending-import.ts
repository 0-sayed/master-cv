/** Private, expiring handoff. A read and its deletion commit in one transaction. */
const DB = "reactive-resume";
const STORE = "pending-import";
const RETENTION_MS = 24 * 60 * 60 * 1000;
type Identity = { ownerId: string; flowId: string };
type PendingImport = Identity & { version: 1; file: File; expiresAt: number };
function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}
const keyOf = ({ ownerId, flowId }: Identity) => JSON.stringify([ownerId, flowId]);
export async function savePendingImport(input: Identity & { file: File; expiresAt: number }) {
	const now = Date.now();
	if (
		!input.ownerId ||
		!input.flowId ||
		!(input.file instanceof File) ||
		input.file.size > 25_000_000 ||
		input.expiresAt <= now ||
		input.expiresAt > now + RETENTION_MS
	)
		throw new Error("Invalid pending import.");
	const db = await open();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(tx.error ?? new Error("Pending import aborted."));
			tx.onerror = () => reject(tx.error);
			tx.objectStore(STORE).put({ ...input, version: 1 } satisfies PendingImport, keyOf(input));
		});
	} finally {
		db.close();
	}
}
export async function takePendingImport(input: Identity & { now?: number }): Promise<File | null> {
	if (!input.ownerId || !input.flowId) return null;
	const db = await open();
	try {
		return await new Promise<File | null>((resolve, reject) => {
			const tx = db.transaction(STORE, "readwrite");
			const store = tx.objectStore(STORE);
			let result: File | null = null;
			tx.oncomplete = () => resolve(result);
			tx.onabort = () => reject(tx.error ?? new Error("Pending import aborted."));
			tx.onerror = () => reject(tx.error);
			store.delete("ats-checker"); // An anonymous legacy handoff is never adopted.
			const key = keyOf(input);
			const request = store.get(key);
			request.onsuccess = () => {
				const value = request.result as PendingImport | undefined;
				store.delete(key);
				const now = input.now ?? Date.now();
				if (
					value?.version === 1 &&
					value.ownerId === input.ownerId &&
					value.flowId === input.flowId &&
					value.file instanceof File &&
					value.expiresAt > now &&
					value.expiresAt <= now + RETENTION_MS
				)
					result = value.file;
			};
		});
	} finally {
		db.close();
	}
}
