// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { ReactNode } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { useTemplateThumbnail } from "./thumbnails";

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), image: vi.fn() }));
vi.mock("@/features/resume/export/pdf-document", () => ({ createResumePdfBlob: mocks.pdf }));
vi.mock("@/features/resume/preview/pdf-thumbnail", () => ({
	createPdfFirstPageImageUrl: mocks.image,
	releaseThumbnailUrls: vi.fn(),
}));

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	mocks.pdf.mockResolvedValue(new Blob(["%PDF"]));
	mocks.image.mockResolvedValue("blob:personal-preview");
	vi.stubGlobal("requestIdleCallback", (callback: () => void) => {
		queueMicrotask(callback);
		return 1;
	});
});

afterEach(() => {
	cleanup();
	client.clear();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

it("keeps the sample image when only account details are filled, without queuing an empty-body PDF", async () => {
	const data = {
		...defaultResumeData,
		basics: { ...defaultResumeData.basics, name: "Example User", email: "example@example.test" },
	};
	const { result } = renderHook(() => useTemplateThumbnail("onyx", data, true), { wrapper });
	await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
	expect(result.current.data).toBeUndefined();
	expect(mocks.pdf).not.toHaveBeenCalled();
});

it("renders the user's own content, then drops the previous thumbnail when the resume becomes blank", async () => {
	const original = structuredClone(sampleResumeData);
	const { result, rerender } = renderHook(
		({ data }: { data: ResumeData }) => useTemplateThumbnail("rhyhorn", data, true),
		{ wrapper, initialProps: { data: sampleResumeData } },
	);
	await waitFor(() => expect(result.current.data).toBe("blob:personal-preview"));
	expect(mocks.pdf).toHaveBeenCalledWith(
		{
			...sampleResumeData,
			metadata: { ...sampleResumeData.metadata, template: "rhyhorn" },
		},
		undefined,
		undefined,
		{ signal: expect.any(AbortSignal), priority: "thumbnail" },
	);
	expect(sampleResumeData).toEqual(original);
	rerender({ data: defaultResumeData });
	await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
	expect(result.current.data).toBeUndefined();
	expect(mocks.pdf).toHaveBeenCalledTimes(1);
});

it("renders a visible picture without text, but keeps the sample for hidden content", async () => {
	const data = structuredClone(defaultResumeData);
	data.picture.url = "https://example.com/photo.png";
	data.summary.content = "<p>Hidden summary</p>";
	data.summary.hidden = true;
	const { result, rerender } = renderHook(
		({ data }: { data: ResumeData }) => useTemplateThumbnail("onyx", data, true),
		{ wrapper, initialProps: { data } },
	);
	await waitFor(() => expect(result.current.data).toBe("blob:personal-preview"));
	rerender({ data: { ...data, picture: { ...data.picture, hidden: true } } });
	await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
	expect(result.current.data).toBeUndefined();
	expect(mocks.pdf).toHaveBeenCalledTimes(1);
});

it("cancels an in-flight thumbnail when the Design panel becomes hidden", async () => {
	let signal: AbortSignal | undefined;
	mocks.pdf.mockImplementation((_data, _template, _options, extras) => {
		signal = extras?.signal;
		return new Promise((_resolve, reject) =>
			signal?.addEventListener("abort", () => reject(signal?.reason), { once: true }),
		);
	});
	const { rerender } = renderHook(({ visible }) => useTemplateThumbnail("onyx", sampleResumeData, visible), {
		wrapper,
		initialProps: { visible: true },
	});
	await waitFor(() => expect(mocks.pdf).toHaveBeenCalledOnce());
	expect(signal?.aborted).toBe(false);
	rerender({ visible: false });
	await waitFor(() => expect(signal?.aborted).toBe(true));
	expect(mocks.image).not.toHaveBeenCalled();
});

it("does not queue hidden Design thumbnails, then renders when the panel opens", async () => {
	const { result, rerender } = renderHook(({ visible }) => useTemplateThumbnail("onyx", sampleResumeData, visible), {
		wrapper,
		initialProps: { visible: false },
	});
	expect(result.current.fetchStatus).toBe("idle");
	expect(mocks.pdf).not.toHaveBeenCalled();
	rerender({ visible: true });
	await waitFor(() => expect(result.current.data).toBe("blob:personal-preview"));
	expect(mocks.pdf).toHaveBeenCalledOnce();
});
