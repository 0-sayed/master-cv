import type { EditorIdentity } from "../editor/store";
import type { PageMap } from "@reactive-resume/pdf/page-map";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { getResumeExportData } from "@reactive-resume/resume/export-sections";
import { createResumePdfBlob } from "./pdf-document";
import { onPersonalStorageCleared } from "@/libs/browser-storage";

declare const __PDF_BUILD__: { renderer: string; template: string; fonts: string };
export type PdfSnapshot = { identity: EditorIdentity; data: ResumeData };
export type PdfArtifact = {
	identity: EditorIdentity;
	inputHash: string;
	bytesHash: string;
	blob: Blob;
	pageMap: PageMap | undefined;
	versions: { renderer: string; template: string; fonts: string; locale: string };
	lostCharacters: string[] | null;
};
const cache = new Map<string, Promise<PdfArtifact>>();
let scope: string | null = null;
let scopeGeneration = 0;
export const clearPdfArtifacts = () => {
	scopeGeneration++;
	cache.clear();
	scope = null;
};
onPersonalStorageCleared(clearPdfArtifacts);
async function sha256(bytes: ArrayBuffer) {
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join("");
}
export const hashPdfInput = (value: unknown) => sha256(new TextEncoder().encode(JSON.stringify(value)).buffer);
/** No URLs or persistent bytes: the canvas and download adapters own and revoke their URLs. */
export async function getPdfArtifact(
	snapshot: PdfSnapshot,
	options: { signal?: AbortSignal } = {},
): Promise<PdfArtifact> {
	options.signal?.throwIfAborted();
	// Clone synchronously: later edits cannot change the input while its hash is being computed.
	const captured = structuredClone(snapshot);
	captured.data = getResumeExportData(captured.data, "resume");
	const versions = { ...__PDF_BUILD__, locale: captured.data.metadata.page.locale };
	const nextScope = captured.identity.ownerId;
	if (scope !== nextScope) {
		clearPdfArtifacts();
		scope = nextScope;
	}
	const generation = scopeGeneration;
	const assertCurrent = () => {
		if (generation !== scopeGeneration) throw new Error("PDF artifact superseded");
	};
	const inputHash = await hashPdfInput([captured.data, versions]);
	options.signal?.throwIfAborted();
	assertCurrent();
	const key = JSON.stringify([captured.identity.resumeId, inputHash]);
	let pending = cache.get(key);
	if (!pending) {
		pending = (async () => {
			let pageMap: PageMap | undefined;
			let lostCharacters: string[] | null = null;
			const blob = await createResumePdfBlob(captured.data, undefined, undefined, {
				onPageMap: (map) => {
					pageMap = map;
				},
				onLostCharacters: (characters) => {
					lostCharacters = characters;
				},
			});
			const bytesHash = await sha256(await blob.arrayBuffer());
			return { identity: captured.identity, inputHash, bytesHash, blob, pageMap, versions, lostCharacters };
		})();
		cache.set(key, pending);
		while (cache.size > 3) {
			const oldest = cache.keys().next().value;
			if (oldest === undefined) break;
			cache.delete(oldest);
		}
		void pending.catch(() => {
			if (cache.get(key) === pending) cache.delete(key);
		});
	}
	const artifact = await pending;
	assertCurrent();
	options.signal?.throwIfAborted();
	// Revision counters reset on reopen and advance on save without changing the PDF input.
	return JSON.stringify(artifact.identity) === JSON.stringify(captured.identity)
		? artifact
		: { ...artifact, identity: captured.identity };
}
