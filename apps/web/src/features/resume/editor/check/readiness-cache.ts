import type { PdfSnapshot } from "../../export/pdf-artifact";
import type { evaluateReadiness } from "./evaluate";
import { hashPdfInput } from "../../export/pdf-artifact";

type Evaluation = Awaited<ReturnType<typeof evaluateReadiness>>;
type Evaluate = (snapshot: PdfSnapshot, signal: AbortSignal) => Promise<Evaluation>;

/** Private to one editor. Keys include ownership, revision, content and date-sensitive rules. */
export function createReadinessCache(run: Evaluate, day = () => new Date().toISOString().slice(0, 10)) {
	const entries = new Map<string, { signal: AbortSignal | undefined; pending: Promise<Evaluation> }>();
	let scope: string | undefined;
	let generation = 0;
	const clear = () => {
		generation++;
		entries.clear();
	};
	return {
		clear,
		async evaluate(snapshot: PdfSnapshot, signal: AbortSignal, retry = 0) {
			signal.throwIfAborted();
			const nextScope = JSON.stringify([snapshot.identity.ownerId, snapshot.identity.resumeId]);
			if (scope !== nextScope) {
				clear();
				scope = nextScope;
			}
			const current = generation;
			const content = await hashPdfInput(snapshot.data);
			signal.throwIfAborted();
			if (current !== generation) throw new DOMException("Editor closed", "AbortError");
			const key = JSON.stringify([snapshot.identity, content, day(), retry]);
			let entry = entries.get(key);
			if (!entry || entry.signal?.aborted) {
				const pending = Promise.resolve().then(() => run(snapshot, signal));
				const created = { signal: signal as AbortSignal | undefined, pending };
				entry = created;
				entries.set(key, created);
				while (entries.size > 3) {
					const oldest = entries.keys().next().value;
					if (oldest === undefined) break;
					entries.delete(oldest);
				}
				const remove = () => {
					if (entries.get(key)?.pending === pending) entries.delete(key);
				};
				void pending.then((value) => {
					if (signal.aborted || value.results.pdf.state === "failed") remove();
					else created.signal = undefined;
				}, remove);
			}
			const value = await entry.pending;
			signal.throwIfAborted();
			if (current !== generation) throw new DOMException("Editor closed", "AbortError");
			return value;
		},
	};
}
