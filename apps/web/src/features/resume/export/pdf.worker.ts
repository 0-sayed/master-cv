/// <reference lib="webworker" />

import type { PdfWorkerRequest, PdfWorkerResponse } from "./pdf-document";
import type { PageMap } from "@reactive-resume/pdf/page-map";

async function loadRenderer() {
	if (import.meta.env.DEV) {
		// Initialize Vite's worker transport before temporarily supplying the refresh runtime's browser global.
		await import(/* @vite-ignore */ "/@vite/client");
		// Vite's refresh wrapper already skips workers, but its runtime writes to window at import time.
		// Cache only that runtime before loading application modules, without giving them a browser global.
		Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
		try {
			await import(/* @vite-ignore */ "/@react-refresh");
		} finally {
			Reflect.deleteProperty(globalThis, "window");
		}
	}
	return Promise.all([import("@reactive-resume/pdf/browser"), import("@/libs/resume/section-title-locale")]);
}

const renderer = loadRenderer();
// A request reports initialization failures through the existing worker response contract.
void renderer.catch(() => undefined);

// Renders off the main thread, so typing, scrolling and the gallery stay smooth while a page is laid out.
self.addEventListener("message", async ({ data: request }: MessageEvent<PdfWorkerRequest>) => {
	const { id, data, template, renderOptions } = request;
	try {
		const [{ createResumePdfBlob, preloadResumePdf }, { createSectionTitleResolverForLocale }] = await renderer;
		preloadResumePdf(data);
		let pageMap: PageMap | undefined;
		let lostCharacters: string[] | undefined;
		const blob = await createResumePdfBlob({
			data,
			template,
			renderOptions,
			resolveSectionTitle: await createSectionTitleResolverForLocale(data.metadata.page.locale),
			onPageMap: (map) => {
				pageMap = map;
			},
			onLostCharacters: (characters) => {
				lostCharacters = characters;
			},
		});
		self.postMessage({ id, blob, pageMap, lostCharacters } satisfies PdfWorkerResponse);
	} catch (error) {
		const cause = error instanceof Error && typeof error.cause === "string" ? error.cause : undefined;
		self.postMessage({
			id,
			error: error instanceof Error ? error.message : String(error),
			cause,
		} satisfies PdfWorkerResponse);
	}
});
