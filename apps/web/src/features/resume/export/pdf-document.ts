import type { PageMap } from "@reactive-resume/pdf/page-map";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { Template } from "@reactive-resume/schema/templates";
import { createSectionTitleResolverForLocale } from "@/libs/resume/section-title-locale";

type ResumePdfRenderOptions = {
	includeCoverLetterHeader?: boolean;
};

type CreateResumePdfBlobExtras = {
	signal?: AbortSignal;
	priority?: "preview" | "thumbnail";
	/** Receives the page map (header, section and item boxes) of this render; used by the editor canvas. */
	onPageMap?: (pageMap: PageMap) => void;
	/** Receives the characters no font could draw (they print as "?"); not called when every character rendered. */
	onLostCharacters?: (characters: string[]) => void;
};

type RenderInput = { data: ResumeData; template?: Template | undefined; renderOptions?: ResumePdfRenderOptions };

export type PdfWorkerRequest = RenderInput & { id: number };
export type PdfWorkerResponse =
	| { id: number; blob: Blob; pageMap: PageMap | undefined; lostCharacters: string[] | undefined }
	// `cause` survives the worker boundary so callers can still tell text loss apart (see `getReadableErrorMessage`).
	| { id: number; error: string; cause: string | undefined };

type Rendered = { blob: Blob; pageMap: PageMap | undefined; lostCharacters: string[] | undefined };

/** The same render on the main thread: where workers aren't available, or the worker failed to start. */
async function renderHere({ data, template, renderOptions }: RenderInput): Promise<Rendered> {
	const [{ createResumePdfBlob }, resolveSectionTitle] = await Promise.all([
		import("@reactive-resume/pdf/browser"),
		createSectionTitleResolverForLocale(data.metadata.page.locale),
	]);
	let pageMap: PageMap | undefined;
	let lostCharacters: string[] | undefined;
	const blob = await createResumePdfBlob({
		data,
		template,
		...(renderOptions ? { renderOptions } : {}),
		resolveSectionTitle,
		onPageMap: (map) => {
			pageMap = map;
		},
		onLostCharacters: (characters) => {
			lostCharacters = characters;
		},
	});
	return { blob, pageMap, lostCharacters };
}

type Pending = {
	id: number;
	input: RenderInput;
	priority: "preview" | "thumbnail";
	resolve(value: Rendered): void;
	reject(error: Error): void;
};

// One engine and font set. Visible previews preempt thumbnail work instead of waiting behind it.
let worker: Worker | null | undefined;
let nextId = 0;
let active: Pending | undefined;
const queued: Pending[] = [];

function drain() {
	if (active || !queued.length) return;
	const index = queued.findIndex((request) => request.priority === "preview");
	const request = queued.splice(index < 0 ? 0 : index, 1)[0];
	if (!request) return;
	active = request;
	const target = getWorker();
	if (target) target.postMessage({ ...request.input, id: request.id } satisfies PdfWorkerRequest);
	else
		void renderHere(request.input)
			.then(request.resolve, request.reject)
			.finally(() => {
				if (active === request) active = undefined;
				drain();
			});
}

function cancel(request: Pending) {
	if (active === request) {
		worker?.terminate();
		worker = undefined;
		active = undefined;
	} else {
		const index = queued.indexOf(request);
		if (index < 0) return;
		queued.splice(index, 1);
	}
	request.reject(new DOMException("PDF render cancelled", "AbortError"));
	drain();
}

function getWorker(): Worker | null {
	if (worker !== undefined) return worker;
	worker = null;
	if (typeof Worker === "undefined") return worker;
	try {
		worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module", name: "resume-pdf" });
	} catch {
		return worker;
	}
	const instance = worker;
	worker.addEventListener("message", ({ data: response }: MessageEvent<PdfWorkerResponse>) => {
		const request = active;
		if (worker !== instance || !request || request.id !== response.id) return;
		active = undefined;
		if ("error" in response) request.reject(new Error(response.error, { cause: response.cause }));
		else request.resolve({ blob: response.blob, pageMap: response.pageMap, lostCharacters: response.lostCharacters });
		drain();
	});
	// Every render is caught inside the worker, so an error here means it couldn't start: render here instead.
	worker.addEventListener("error", () => {
		if (worker !== instance) return;
		worker?.terminate();
		worker = null;
		if (active) queued.unshift(active);
		active = undefined;
		drain();
	});
	return worker;
}

function render(input: RenderInput, priority: "preview" | "thumbnail", signal?: AbortSignal): Promise<Rendered> {
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		const cleanup = () => signal?.removeEventListener("abort", abort);
		const request: Pending = {
			id: ++nextId,
			input,
			priority,
			resolve: (value) => {
				cleanup();
				resolve(value);
			},
			reject: (error) => {
				cleanup();
				reject(error);
			},
		};
		const abort = () => cancel(request);
		signal?.addEventListener("abort", abort, { once: true });
		queued.push(request);
		if (priority === "preview" && active?.priority === "thumbnail") cancel(active);
		drain();
	});
}

export const createResumePdfBlob = async (
	data: ResumeData,
	template?: Template,
	renderOptions?: ResumePdfRenderOptions,
	{ onPageMap, onLostCharacters, signal, priority = "preview" }: CreateResumePdfBlobExtras = {},
) => {
	const { blob, pageMap, lostCharacters } = await render(
		{
			data,
			template,
			...(renderOptions ? { renderOptions } : {}),
		},
		priority,
		signal,
	);
	signal?.throwIfAborted();
	if (pageMap) onPageMap?.(pageMap);
	if (lostCharacters) onLostCharacters?.(lostCharacters);
	return blob;
};
