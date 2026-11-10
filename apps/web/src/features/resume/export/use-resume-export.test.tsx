// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { useResumeExport } from "./use-resume-export";

const mocks = vi.hoisted(() => ({ render: vi.fn(), download: vi.fn(), toast: vi.fn() }));
vi.mock("./pdf-document", () => ({ createResumePdfBlob: mocks.render }));
vi.mock("@reactive-resume/utils/file", () => ({ downloadWithAnchor: mocks.download }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.toast, close: vi.fn() } }));
vi.mock("@/features/resume/public/public-pdf", () => ({ resolvePublicResumePdfBlob: mocks.render }));
vi.mock("@/libs/orpc/client", () => ({ client: {} }));
vi.mock("@/libs/resume/section-title-locale", () => ({ createSectionTitleResolverForLocale: async () => () => "" }));

beforeEach(() => {
	vi.clearAllMocks();
	i18n.load("en-US", {});
	i18n.activate("en-US");
	document.documentElement.style.setProperty("--motion-success-hold", "1500ms");
});
afterEach(() => {
	vi.useRealTimers();
	document.documentElement.style.removeProperty("--motion-success-hold");
});
const resume = { name: "Synthetic sample", slug: "sample", data: sampleResumeData };

it("acknowledges only a completed download and retains its result without racing another request", async () => {
	vi.useFakeTimers();
	let finish!: (file: Blob) => void;
	mocks.render.mockReturnValueOnce(
		new Promise<Blob>((resolve) => {
			finish = resolve;
		}),
	);
	const { result } = renderHook(() => useResumeExport(resume));
	let pending!: Promise<void>;
	act(() => {
		pending = result.current.onDownloadPDF();
		void result.current.onDownloadPDF();
	});
	expect(result.current.downloadState).toBe("pending");
	expect(mocks.render).toHaveBeenCalledTimes(1);
	await act(async () => {
		finish(new Blob(["%PDF"]));
		await pending;
	});
	expect(mocks.download).toHaveBeenCalledTimes(1);
	expect(result.current.downloadState).toBe("ready");
	act(() => vi.advanceTimersByTime(1499));
	expect(result.current.downloadState).toBe("ready");
	act(() => vi.advanceTimersByTime(1));
	expect(result.current.downloadState).toBe("ready");
});
it("never reports ready after rendering or download handoff fails", async () => {
	const { result } = renderHook(() => useResumeExport(resume));
	mocks.render.mockRejectedValueOnce(new Error("Render unavailable"));
	await act(async () => result.current.onDownloadPDF());
	expect(result.current.downloadState).toBe("failed");
	expect(mocks.download).not.toHaveBeenCalled();
	mocks.render.mockResolvedValueOnce(new Blob(["%PDF"]));
	mocks.download.mockImplementationOnce(() => {
		throw new Error("Download blocked");
	});
	await act(async () => result.current.onDownloadPDF());
	expect(result.current.downloadState).toBe("failed");
});
