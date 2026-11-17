// @vitest-environment happy-dom
import type { Application } from "../types";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApplicationDetailPage } from "./application-detail-page";

const api = vi.hoisted(() => ({ get: vi.fn(), navigate: vi.fn(), update: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		documents: {
			list: {
				queryOptions: () => ({
					queryKey: ["documents"],
					queryFn: async () => [{ id: "resume-1", type: "resume", name: "Submitted CV" }],
				}),
			},
		},
		applications: {
			getById: {
				queryOptions: ({ input }: { input: { id: string } }) => ({
					queryKey: ["application", input.id],
					queryFn: () => api.get(input.id),
				}),
			},
			update: { mutationOptions: () => ({ mutationFn: api.update }) },
		},
	},
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => api.navigate,
	Link: ({ children }: { children: ReactNode }) => <a href="/dashboard/applications">{children}</a>,
}));
vi.mock("../use-application-actions", () => ({
	useInvalidateApplications: () => vi.fn(),
	useApplicationActions: () => ({ moveTo: vi.fn(), close: vi.fn(), remove: { isPending: false, mutate: vi.fn() } }),
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/features/career/workspace/shell", () => ({ defaultWorkspaceTab: () => "fit" }));
vi.mock("./application-form-sheet", () => ({
	ApplicationFormSheet: ({ open }: { open: boolean }) =>
		open ? <div role="dialog" aria-label="Edit application" /> : null,
}));
vi.mock("./application-notes", () => ({ ApplicationNotes: () => <section>Notes</section> }));
vi.mock("./detail/activity", () => ({ Activity: () => <section>Activity</section> }));
vi.mock("./detail/contacts", () => ({ Contacts: () => null }));
vi.mock("./detail/next-step-card", () => ({ NextStepCard: () => <section>Next step</section> }));
vi.mock("./detail/sent-documents", () => ({ SentDocuments: () => <section>CV version and documents</section> }));
vi.mock("./detail/close-dialog", () => ({ CloseDialog: () => null }));
vi.mock("./interview-dialog", () => ({ InterviewDialog: () => null }));

const application: Application = {
	id: "owned-application",
	role: "Engineer",
	company: "Synthetic Company",
	location: "Riyadh",
	status: "saved",
	activity: [],
	tags: ["Remote"],
	contacts: [],
	appliedAt: new Date("2026-11-16T12:00:00Z"),
	updatedAt: new Date("2026-11-16T12:00:00Z"),
	closedReason: null,
	coverLetterId: null,
	selectedResumeVersionId: null,
	sentResumeRecordedAt: null,
	sentResumeVersionId: null,
	sentCoverLetterVersionId: null,
	sentCheckScore: null,
	requirements: [],
	salary: null,
	source: null,
	sourceUrl: null,
	notes: null,
	createdAt: new Date("2026-11-16T12:00:00Z"),
	resumeId: null,
	jobDescription: null,
	postingSource: null,
	matchScore: null,
	aiMetadata: null,
	resumeFileUrl: null,
	resumeFileName: null,
	coverLetterUrl: null,
	coverLetterName: null,
	followUpAt: null,
	followUpNote: null,
};

const clients: QueryClient[] = [];
function mount() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	return render(
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<ApplicationDetailPage applicationId={application.id} />
			</I18nProvider>
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	api.get.mockResolvedValue(application);
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

it("opens the owned record while withholding the excluded interview workspace", async () => {
	const view = mount();
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
	expect(api.get).toHaveBeenCalledWith(application.id);
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.getByRole("link", { name: "Back to applications" })).toHaveAttribute("href", "/dashboard/applications");
	const columns = view.container.querySelector('[data-slot="application-detail-columns"]');
	expect(columns?.children[0]).toHaveTextContent("Next step");
	expect(columns?.children[0]).toHaveTextContent("CV version and documents");
	expect(columns?.children[1]).toHaveTextContent("Notes");
	expect(columns?.children[1]).toHaveTextContent("Activity");
	expect(screen.queryByRole("button", { name: "Open workspace" })).toBeNull();
	expect(api.navigate).not.toHaveBeenCalled();
});

it("keeps unavailable or unauthorized records behind a recoverable error", async () => {
	api.get.mockRejectedValue(new Error("NOT_FOUND"));
	mount();
	await screen.findByRole("alert");
	expect(screen.queryByText("Synthetic Company")).toBeNull();
	api.get.mockResolvedValue(application);
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
});

it("opens the existing edit form from the page menu", async () => {
	mount();
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
	fireEvent.click(screen.getByRole("button", { name: "Application options" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Edit details…" }));
	expect(screen.getByRole("dialog", { name: "Edit application" })).toBeInTheDocument();
});

it("records the selected submitted document and offers neutral cancellation", async () => {
	api.update.mockResolvedValue(application);
	mount();
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
	fireEvent.click(screen.getByRole("button", { name: "Mark as applied" }));
	await screen.findByRole("option", { name: "Submitted CV" });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(api.update).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Mark as applied" }));
	fireEvent.change(screen.getByLabelText("Resume submitted (optional)"), { target: { value: "resume-1" } });
	fireEvent.click(screen.getByRole("button", { name: "Confirm applied" }));
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
	expect(api.update).toHaveBeenCalledWith(
		expect.objectContaining({ id: application.id, status: "applied", resumeId: "resume-1" }),
		expect.anything(),
	);
});
