// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JobTargetForm, JobTargetPage } from "./job-target-page";
const { saveAndSelect, evidenceRead } = vi.hoisted(() => ({
	saveAndSelect: vi.fn(),
	evidenceRead: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	Link: ({ children }: { children: React.ReactNode }) => <a href="/dashboard">{children}</a>,
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { career: { jobTargets: { saveAndSelect } } },
	orpc: {
		resume: {
			getById: {
				queryOptions: () => ({
					queryKey: ["cv"],
					queryFn: async () => ({ id: "cv", name: "Synthetic CV", updatedAt: new Date("2026-11-14T00:00:00.000Z") }),
				}),
			},
			list: { queryOptions: () => ({ queryKey: ["documents"], queryFn: async () => [] }) },
		},
		career: { jobTargets: { evidence: { queryOptions: () => ({ queryKey: ["evidence"], queryFn: evidenceRead }) } } },
	},
}));
vi.mock("./job-evidence-page", () => ({ JobEvidencePage: () => null }));
vi.mock("@/features/resume/editor/proposals/review-operation", () => ({
	ReviewNotice: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>,
}));
afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});
it("requires a role and exact ad, submits unchanged whitespace, and cancels without saving", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const compare = vi.fn();
	const cancel = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<JobTargetForm sourceName="Synthetic CV" initial={null} pending={false} onCompare={compare} onCancel={cancel} />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Compare" }).hasAttribute("disabled")).toBe(true);
	fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Engineer" } });
	fireEvent.change(screen.getByLabelText("Job ad"), { target: { value: "  React\nArabic عربي  " } });
	fireEvent.click(screen.getByRole("button", { name: "Compare" }));
	expect(compare).toHaveBeenCalledWith({ role: "Engineer", employer: "", text: "  React\nArabic عربي  " });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(cancel).toHaveBeenCalledOnce();
});

it("saves and selects the comparison through one atomic request before leaving the form", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	evidenceRead.mockResolvedValueOnce({ selection: null, job: null });
	evidenceRead.mockResolvedValue({ selection: { revision: "selected" }, job: { text: "Exact ad" } });
	saveAndSelect.mockResolvedValue({ revision: "selected" });
	render(
		<QueryClientProvider client={queryClient}>
			<I18nProvider i18n={i18n}>
				<JobTargetPage resumeId="cv" />
			</I18nProvider>
		</QueryClientProvider>,
	);
	fireEvent.change(await screen.findByLabelText("Job title"), { target: { value: "Engineer" } });
	fireEvent.change(screen.getByLabelText("Job ad"), { target: { value: "  Exact ad\n" } });
	fireEvent.click(screen.getByRole("button", { name: "Compare" }));
	await waitFor(() => expect(screen.queryByRole("button", { name: "Compare" })).toBeNull());
	expect(saveAndSelect).toHaveBeenCalledExactlyOnceWith({
		resumeId: "cv",
		expectedUpdatedAt: "2026-11-14T00:00:00.000Z",
		expectedSelectionRevision: null,
		role: "Engineer",
		employer: "",
		text: "  Exact ad\n",
	});
	expect(screen.queryByRole("alert")).toBeNull();
	queryClient.clear();
});
