// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Dialog } from "@reactive-resume/ui/components/dialog";

const api = vi.hoisted(() => ({
	providers: vi.fn(),
	importResume: vi.fn(),
	parsePdf: vi.fn(),
	parseDocx: vi.fn(),
	extractPdfText: vi.fn(),
	saveDraft: vi.fn(),
	navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => api.navigate,
	useRouteContext: () => ({ session: { user: { id: "owner" } } }),
}));
vi.mock("@/features/resume/import/review-draft", async (original) => ({
	...(await original<typeof import("@/features/resume/import/review-draft")>()),
	saveReviewDraft: api.saveDraft,
}));
vi.mock("@/features/resume/import/pdf-text", () => ({ extractPdfText: api.extractPdfText }));
vi.mock("@/libs/orpc/client", () => ({
	client: { resume: { import: api.importResume }, ai: { parsePdf: api.parsePdf, parseDocx: api.parseDocx } },
	orpc: {
		aiProviders: {
			list: { queryOptions: () => ({ queryKey: ["providers"], queryFn: api.providers, retry: false }) },
		},
		documents: { key: () => ["documents"] },
		resume: { create: { mutationOptions: () => ({ mutationFn: vi.fn() }) } },
		coverLetters: { create: { mutationOptions: () => ({ mutationFn: vi.fn() }) } },
	},
}));

import { NewDocumentDialog } from "./new-document-dialog";
import { useDialogStore } from "@/dialogs/store";

let queryClient: QueryClient;
beforeEach(() => {
	vi.clearAllMocks();
	useDialogStore.getState().openDialog("document.new", undefined);
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	api.providers.mockRejectedValue(new Error("Provider lookup offline"));
	api.importResume.mockResolvedValue("imported-resume");
	api.extractPdfText.mockResolvedValue({
		lines: ["Alex Morgan", "alex@example.test", "Product Manager", "Experience", "Customer research"],
	});
});
afterEach(() => {
	cleanup();
	queryClient.clear();
});
function mount(file: File) {
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<Dialog open>
					<NewDocumentDialog data={{ file }} />
				</Dialog>
			</QueryClientProvider>
		</I18nProvider>,
	);
}

it("reads PDF natively and hands off to the review route without server persistence or a provider", async () => {
	const file = new File(["%PDF-test"], "resume.pdf", { type: "application/pdf" });
	mount(file);
	await waitFor(() =>
		expect(api.navigate).toHaveBeenCalledWith({
			to: "/dashboard/import/$flowId",
			params: { flowId: expect.any(String) },
		}),
	);
	expect(api.saveDraft).toHaveBeenCalledWith(
		expect.objectContaining({
			ownerId: "owner",
			file,
			state: expect.objectContaining({
				data: expect.objectContaining({ basics: expect.objectContaining({ name: "Alex Morgan" }) }),
			}),
		}),
	);
	expect(api.providers).not.toHaveBeenCalled();
	expect(api.extractPdfText).toHaveBeenCalledWith(file, expect.any(AbortSignal));
	expect(api.importResume).not.toHaveBeenCalled();
	expect(api.parsePdf).not.toHaveBeenCalled();
	expect(screen.queryByRole("heading", { name: "Review imported information" })).not.toBeInTheDocument();
});
it("keeps Word unavailable without a provider lookup or model call", async () => {
	mount(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "resume.docx"));
	await screen.findByText("Choose a readable PDF. Word import is not available.");
	expect(api.providers).not.toHaveBeenCalled();
	expect(api.parseDocx).not.toHaveBeenCalled();
	expect(api.extractPdfText).not.toHaveBeenCalled();
	expect(api.importResume).not.toHaveBeenCalled();
});
