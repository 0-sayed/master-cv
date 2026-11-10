// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { sampleResumeData } from "@reactive-resume/schema/resume/sample";
import { ResumeThumbnail } from "./resume-thumbnail";

const mocks = vi.hoisted(() => ({ pdf: vi.fn(), image: vi.fn(), getById: vi.fn() }));
vi.mock("motion/react", () => ({ useInView: () => true }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		resume: {
			getById: {
				queryOptions: ({ input }: { input: { id: string } }) => ({
					queryKey: ["resume", input.id],
					queryFn: mocks.getById,
				}),
			},
		},
	},
}));
vi.mock("@/features/resume/export/pdf-document", () => ({ createResumePdfBlob: mocks.pdf }));
vi.mock("@/features/resume/preview/pdf-thumbnail", () => ({
	createPdfFirstPageImageUrl: mocks.image,
	releaseThumbnailUrls: vi.fn(),
}));

let client: QueryClient;
const first = new Date("2026-11-09T09:00:00Z");
const second = new Date("2026-11-09T10:00:00Z");
const summary = (updatedAt = first) => ({ id: "resume-1", updatedAt });
const record = (data: ResumeData, updatedAt = first) => ({ ...summary(updatedAt), data });
const wrapper = ({ children }: { children: React.ReactNode }) => (
	<I18nProvider i18n={i18n}>
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	</I18nProvider>
);

beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
	mocks.pdf.mockResolvedValue(new Blob(["%PDF"]));
	mocks.image.mockResolvedValue("blob:preview-first");
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(private callback: (entries: unknown[]) => void) {}
			observe() {
				this.callback([{ contentRect: new DOMRect(0, 0, 176, 249) }]);
			}
			disconnect() {}
		},
	);
	vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
	client.clear();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

it("labels name-only new CVs as empty without rendering a blank PDF", async () => {
	mocks.getById.mockResolvedValue(
		record({ ...defaultResumeData, basics: { ...defaultResumeData.basics, name: "سارة العتيبي" } }),
	);
	render(<ResumeThumbnail resume={summary()} />, { wrapper });
	await expect(screen.findByText("Empty CV")).resolves.toBeVisible();
	expect(mocks.pdf).not.toHaveBeenCalled();
});

it("shows loading until a real first-page image loads, then replaces the skeleton", async () => {
	mocks.getById.mockResolvedValue(record(sampleResumeData));
	const { container } = render(<ResumeThumbnail resume={summary()} />, { wrapper });
	expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
	await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
	const image = container.querySelector("img");
	if (!image) throw new Error("The first-page preview image was not mounted");
	expect(image.getAttribute("src")).toBe("blob:preview-first");
	fireEvent.load(image);
	expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
});

it("fetches the revised document and regenerates the preview after edits", async () => {
	mocks.getById.mockResolvedValue(record(sampleResumeData));
	const { container, rerender } = render(<ResumeThumbnail resume={summary()} />, { wrapper });
	await waitFor(() => expect(mocks.pdf).toHaveBeenCalledTimes(1));
	const edited = { ...sampleResumeData, basics: { ...sampleResumeData.basics, headline: "Updated headline" } };
	mocks.getById.mockResolvedValue(record(edited, second));
	mocks.image.mockResolvedValue("blob:preview-second");
	await act(async () => rerender(<ResumeThumbnail resume={summary(second)} />));
	await waitFor(() => expect(mocks.pdf).toHaveBeenCalledWith(edited));
	await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "blob:preview-second"));
});

it("replaces a failed preview image with an explicit error rather than a blank or broken image", async () => {
	mocks.getById.mockResolvedValue(record(sampleResumeData));
	const { container } = render(<ResumeThumbnail resume={summary()} />, { wrapper });
	await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
	const image = container.querySelector("img");
	if (!image) throw new Error("The first-page preview image was not mounted");
	fireEvent.error(image);
	expect(screen.getByText("Preview unavailable")).toBeVisible();
	expect(container.querySelector("img")).toBeNull();
});
