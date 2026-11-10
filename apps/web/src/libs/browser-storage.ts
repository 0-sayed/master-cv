/** Every browser key has one declared scope. Clear personal entries; retain only explicitly owner-scoped recovery. */
const registry = {
	identityOwner: { key: "master-cv:identity-owner", scope: "device" },
	resumeBackup: { prefix: "reactive-resume:unsaved:", scope: "personal" },
	letterSender: { prefix: "letter-sender:", scope: "personal" },
	careerDraft: { prefix: "career-draft:", scope: "owner" },
	debriefDraft: { prefix: "career-debrief-draft:", scope: "personal" },
	notesDraft: { prefix: "application-notes:", scope: "personal" },
	coachContext: { prefix: "career-context:", scope: "personal" },
	coachOffers: { prefix: "career-offers:", scope: "personal" },
	memoryDismissed: { prefix: "career-memory-dismissed:", scope: "personal" },
	offersPair: { key: "career:offers-pair", scope: "personal" },
	newDocuments: { key: "new-documents", scope: "personal" },
	followUpDismissed: { key: "applications-follow-up-dismissed", scope: "personal" },
	voice: { key: "career-voice-settings", scope: "device" },
	documentsView: { key: "documents-view", scope: "device" },
	sidebar: { prefix: "master-cv:sidebar:", scope: "device" },
} as const;

declare const registeredKey: unique symbol;
export type RegisteredStorageKey = string & { readonly [registeredKey]: true };
type StorageName = Exclude<keyof typeof registry, "careerDraft">;
export function storageKey(
	...args: [name: "careerDraft", ownerId: string, documentId: string] | [name: StorageName, suffix?: string]
): RegisteredStorageKey {
	const [name, suffix = "", documentId] = args;
	const entry = registry[name];
	if (entry.scope === "owner") {
		if (!suffix || suffix === "anonymous" || suffix.includes(":") || !documentId)
			throw new Error("Owner-scoped storage requires an authenticated owner and document");
		return `${entry.prefix}${suffix}:${documentId}` as RegisteredStorageKey;
	}
	return ("key" in entry ? entry.key : `${entry.prefix}${suffix}`) as RegisteredStorageKey;
}
function entryFor(key: string) {
	return Object.values(registry).find((entry) => ("key" in entry ? entry.key === key : key.startsWith(entry.prefix)));
}
function area(kind: "localStorage" | "sessionStorage") {
	const validate = (key: string) => {
		if (!entryFor(key)) throw new Error("Unregistered browser storage key");
		return key;
	};
	return {
		getItem: (key: RegisteredStorageKey) => window[kind].getItem(validate(key)),
		setItem: (key: RegisteredStorageKey, value: string) => window[kind].setItem(validate(key), value),
		removeItem: (key: RegisteredStorageKey) => window[kind].removeItem(validate(key)),
	};
}
export const browserStorage = { local: area("localStorage"), session: area("sessionStorage") };
/** Zustand passes its registered name back as a plain string; keep runtime validation at that boundary. */
export const registeredPersistStorage = {
	getItem: (key: string) => browserStorage.local.getItem(key as RegisteredStorageKey),
	setItem: (key: string, value: string) => browserStorage.local.setItem(key as RegisteredStorageKey, value),
	removeItem: (key: string) => browserStorage.local.removeItem(key as RegisteredStorageKey),
};
const personalResets = new Set<() => void>();
export function onPersonalStorageCleared(reset: () => void) {
	personalResets.add(reset);
	return () => {
		personalResets.delete(reset);
	};
}
let generation = 0;
let controller = new AbortController();
export const personalStorageGeneration = () => generation;
export function invalidatePersonalRequests() {
	generation += 1;
	controller.abort();
	controller = new AbortController();
}
export async function runPersonalRequest<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	parent?: AbortSignal,
): Promise<T> {
	const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
	signal.throwIfAborted();
	try {
		const result = await operation(signal);
		signal.throwIfAborted();
		return result;
	} catch (error) {
		signal.throwIfAborted();
		throw error;
	}
}
export function clearPersonalStorage() {
	invalidatePersonalRequests();
	for (const kind of ["localStorage", "sessionStorage"] as const) {
		try {
			const storage = window[kind];
			for (const key of Object.keys(storage)) {
				const entry = entryFor(key);
				const unboundOwner =
					entry?.scope === "owner" && !/^(?!anonymous:)[^:]+:.+/.test(key.slice(entry.prefix.length));
				if (entry?.scope === "personal" || unboundOwner) storage.removeItem(key);
			}
		} catch {
			/* Storage can be blocked; private memory still must be cleared. */
		}
	}
	for (const reset of personalResets) {
		try {
			reset();
		} catch {
			/* One unavailable persistence adapter must not retain other private runtimes. */
		}
	}
}
