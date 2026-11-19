import { afterEach, expect, it, vi } from "vite-plus/test";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";

const mocks = vi.hoisted(() => ({ postMessage: vi.fn(), rendererHasWindow: false }));

vi.mock("/@vite/client", () => {
	if (Reflect.has(globalThis, "window")) throw new Error("The Vite transport must initialize in worker scope");
	return {};
});
vi.mock("/@react-refresh", async () => {
	await import("/@vite/client");
	// Reproduce the installed refresh runtime's import-time browser-global access.
	Object.assign(window, { __registerBeforePerformReactRefresh: vi.fn() });
	return {};
});
vi.mock("@reactive-resume/pdf/browser", async () => {
	// PDF components import this same runtime through Vite's refresh wrappers.
	await import("/@react-refresh");
	mocks.rendererHasWindow = Reflect.has(globalThis, "window");
	return {
		preloadResumePdf: vi.fn(),
		createResumePdfBlob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
	};
});
vi.mock("@/libs/resume/section-title-locale", () => ({ createSectionTitleResolverForLocale: async () => () => "" }));

afterEach(() => {
	vi.unstubAllGlobals();
	Reflect.deleteProperty(globalThis, "window");
});

it("renders the first queued worker request without exposing the refresh browser global to the renderer", async () => {
	const scope = Object.assign(new EventTarget(), { postMessage: mocks.postMessage });
	vi.stubGlobal("self", scope);
	await import("./pdf.worker");
	scope.dispatchEvent(new MessageEvent("message", { data: { id: 1, data: sampleResumeData } }));
	await vi.waitFor(() => expect(mocks.postMessage).toHaveBeenCalledOnce());
	expect(mocks.postMessage).toHaveBeenCalledWith({
		id: 1,
		blob: expect.any(Blob),
		pageMap: undefined,
		lostCharacters: undefined,
	});
	expect(mocks.rendererHasWindow).toBe(false);
	expect(Reflect.has(globalThis, "window")).toBe(false);
});
