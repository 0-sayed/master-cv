import type { PdfWorkerRequest } from "./pdf-document";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";

const mocks = vi.hoisted(() => ({ renderHere: vi.fn() }));
vi.mock("@reactive-resume/pdf/browser", () => ({ createResumePdfBlob: mocks.renderHere }));
vi.mock("@/libs/resume/section-title-locale", () => ({ createSectionTitleResolverForLocale: async () => () => "" }));

const pageMap = { pages: [{ width: 595, height: 842 }], nodes: [] };

/** Stands in for the browser's Worker: `reply` decides what it sends back for each request. */
function stubWorker(reply: (request: PdfWorkerRequest, worker: EventTarget) => void) {
	class FakeWorker extends EventTarget {
		postMessage(request: PdfWorkerRequest) {
			queueMicrotask(() => reply(request, this));
		}
		terminate() {}
	}
	vi.stubGlobal("Worker", FakeWorker);
}

beforeEach(() => {
	vi.resetModules();
	mocks.renderHere.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createResumePdfBlob", () => {
	it("preempts a thumbnail for the visible preview and cancels hidden work", async () => {
		const workers: Array<{ target: EventTarget; requests: PdfWorkerRequest[]; terminate: ReturnType<typeof vi.fn> }> =
			[];
		vi.stubGlobal(
			"Worker",
			class extends EventTarget {
				requests: PdfWorkerRequest[] = [];
				terminate = vi.fn();
				constructor() {
					super();
					workers.push({ target: this, requests: this.requests, terminate: this.terminate });
				}
				postMessage(request: PdfWorkerRequest) {
					this.requests.push(request);
				}
			},
		);
		const { createResumePdfBlob } = await import("./pdf-document");
		const controller = new AbortController();
		const thumbnail = createResumePdfBlob(sampleResumeData, undefined, undefined, {
			priority: "thumbnail",
			signal: controller.signal,
		});
		const cancelled = expect(thumbnail).rejects.toHaveProperty("name", "AbortError");
		const preview = createResumePdfBlob(sampleResumeData);
		await cancelled;
		expect(workers[0]?.terminate).toHaveBeenCalledOnce();
		const active = workers[1];
		expect(active?.requests).toHaveLength(1);
		const blob = new Blob(["preview"]);
		active?.target.dispatchEvent(new MessageEvent("message", { data: { id: active.requests[0]?.id, blob } }));
		await expect(preview).resolves.toBe(blob);
		const hidden = createResumePdfBlob(sampleResumeData, undefined, undefined, {
			priority: "thumbnail",
			signal: controller.signal,
		});
		const aborted = expect(hidden).rejects.toHaveProperty("name", "AbortError");
		controller.abort();
		await aborted;
		expect(active?.terminate).toHaveBeenCalledOnce();
	});
	it("renders on the main thread when the worker can't start", async () => {
		const blob = new Blob(["%PDF"], { type: "application/pdf" });
		mocks.renderHere.mockImplementation(({ onPageMap }) => {
			onPageMap(pageMap);
			return Promise.resolve(blob);
		});
		stubWorker((_request, worker) => worker.dispatchEvent(new Event("error")));
		const { createResumePdfBlob } = await import("./pdf-document");
		const onPageMap = vi.fn();

		await expect(createResumePdfBlob(sampleResumeData, undefined, undefined, { onPageMap })).resolves.toBe(blob);
		expect(onPageMap).toHaveBeenCalledWith(pageMap);
		// Later renders skip the broken worker.
		await createResumePdfBlob(sampleResumeData);
		expect(mocks.renderHere).toHaveBeenCalledTimes(2);
	});
});
