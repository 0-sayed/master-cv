// @vitest-environment happy-dom
import type { Application } from "../types";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, assert, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApplicationDetailPage } from "./application-detail-page";

const api = vi.hoisted(() => ({
	get: vi.fn(),
	navigate: vi.fn(),
	update: vi.fn(),
	moveTo: vi.fn(),
	close: vi.fn(),
	remove: vi.fn(),
	gate: false,
	pending: false,
	variables: null as { status: string } | null,
	error: null as Error | null,
}));
vi.mock("@reactive-resume/schema/personal-tools", () => ({ isFeatureAvailable: () => api.gate }));
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
	useApplicationActions: () => ({
		moveTo: api.moveTo,
		update: { isPending: api.pending, error: api.error, variables: api.variables },
		close: api.close,
		remove: { isPending: false, mutate: api.remove },
	}),
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
function mount(value: Application = application) {
	if (value !== application) api.get.mockResolvedValue(value);
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
	api.gate = false;
	api.pending = false;
	api.error = null;
	api.variables = null;
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
	expect(columns).toHaveTextContent("Activity");
	expect(columns?.querySelector("aside")).toHaveTextContent("CV version and documents");
	expect(columns?.querySelector("aside")).toHaveTextContent("Details");
	expect(screen.getByRole("region", { name: "Details" })).toBeTruthy();
	expect(screen.getByRole("region", { name: "Job summary" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Open workspace" })).toBeNull();
	expect(api.navigate).not.toHaveBeenCalled();
});

it("keeps unavailable or unauthorized records behind a recoverable error", async () => {
	api.get.mockRejectedValue(Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" }));
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
	fireEvent.click(screen.getByRole("button", { name: "More actions" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Edit details…" }));
	expect(screen.getByRole("dialog", { name: "Edit application" })).toBeInTheDocument();
});

it("records the selected submitted document and offers neutral cancellation", async () => {
	api.update.mockResolvedValue(application);
	mount();
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
	fireEvent.change(screen.getByRole("combobox", { name: "Application stage" }), { target: { value: "applied" } });
	await screen.findByRole("option", { name: "Submitted CV" });
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(api.update).not.toHaveBeenCalled();
	fireEvent.change(screen.getByRole("combobox", { name: "Application stage" }), { target: { value: "applied" } });
	fireEvent.change(screen.getByLabelText("Resume submitted (optional)"), { target: { value: "resume-1" } });
	fireEvent.click(screen.getByRole("button", { name: "Confirm applied" }));
	await screen.findByRole("heading", { name: "Engineer", level: 1 });
	expect(api.update).toHaveBeenCalledWith(
		expect.objectContaining({ id: application.id, status: "applied", resumeId: "resume-1" }),
		expect.anything(),
	);
});

it("uses one full stage select without competing progress controls", async () => {
	mount();
	await screen.findByRole("heading", { name: "Engineer" });
	const select = screen.getByRole("combobox", { name: "Application stage" });
	expect(Array.from(select.querySelectorAll("option")).map((o) => o.value)).toEqual([
		"saved",
		"applied",
		"screening",
		"interview",
		"offer",
	]);
	expect(screen.queryByRole("list", { name: "Stages" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Mark as applied" })).toBeNull();
});
it("shows an honest missing closure reason and reopens from the menu", async () => {
	api.get.mockResolvedValue({ ...application, status: "closed", closedReason: null });
	mount();
	await screen.findByRole("heading", { name: "Engineer" });
	expect(screen.queryByRole("combobox", { name: "Application stage" })).toBeNull();
	expect(screen.getByText("Reason not recorded")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "More actions" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Reopen" }));
	expect(api.moveTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: application.id }), "applied");
});

it("keeps cached content with a retry and blocks writes after a failed refresh", async () => {
	mount();
	await screen.findByRole("heading", { name: "Engineer" });
	api.get.mockRejectedValue(new Error("offline"));
	assert(clients[0]);
	await clients[0].invalidateQueries({ queryKey: ["application", application.id] });
	await screen.findByRole("alert");
	expect(screen.getByRole("heading", { name: "Engineer" })).toBeTruthy();
	expect(screen.getByRole("combobox", { name: "Application stage" })).toBeDisabled();
	api.get.mockResolvedValue(application);
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() => expect(screen.getByRole("combobox", { name: "Application stage" })).not.toBeDisabled());
});
it("keeps initial loading separate from a failed record", () => {
	api.get.mockReturnValue(new Promise(() => {}));
	mount();
	expect(screen.queryByRole("alert")).toBeNull();
	expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});
it("blocks repeated stage changes during a pending mutation", async () => {
	api.pending = true;
	mount();
	await screen.findByRole("heading", { name: "Engineer" });
	expect(screen.getByRole("combobox", { name: "Application stage" })).toBeDisabled();
});
it("keeps posting provenance, requirements and incomplete-text recovery", async () => {
	mount({
		...application,
		jobDescription: "Saved وصف",
		requirements: ["TypeScript"],
		sourceUrl: "https://example.test/job",
		postingSource: { method: "paste", completeness: "incomplete", truncated: true } as Application["postingSource"],
	});
	await screen.findByRole("heading", { name: "Engineer" });
	fireEvent.click(screen.getByRole("button", { name: "Job summary" }));
	fireEvent.click(screen.getByRole("button", { name: "View full posting" }));
	expect(screen.getByRole("dialog")).toHaveTextContent("TypeScript");
	expect(screen.getByRole("dialog")).toHaveTextContent("Pasted description");
	expect(screen.getByRole("alert")).toHaveTextContent("incomplete");
	fireEvent.keyDown(document, { key: "Escape" });
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
it("keeps the job summary collapsed until requested and provides jump targets", async () => {
	api.get.mockResolvedValue({ ...application, jobDescription: "وصف Mixed saved content" });
	mount();
	await screen.findByRole("heading", { name: "Engineer" });
	expect(screen.queryByText("وصف Mixed saved content")).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Job summary" }));
	expect(screen.getByText("وصف Mixed saved content").getAttribute("dir")).toBe("auto");
	expect(screen.getByRole("link", { name: "Jump to Activity" })).toHaveAttribute("href", "#application-activity");
	expect(screen.getByRole("link", { name: "Jump to Documents" })).toHaveAttribute("href", "#application-sent");
});

it.each([
	["accepted", "Accepted offer"],
	["not-selected", "Not selected"],
	["withdrew", "I withdrew"],
	["accepted-other", "Accepted another offer"],
	["no-response", "No response"],
] as const)("keeps closed reason %s separate from the active stage", async (closedReason, label) => {
	mount({ ...application, status: "closed", closedReason });
	await screen.findByRole("heading", { name: "Engineer" });
	expect(screen.getByText(label)).toBeTruthy();
	expect(screen.queryByRole("combobox", { name: "Application stage" })).toBeNull();
});

it("keeps the preparation entry gated and in the document rail", async () => {
	api.gate = true;
	const view = mount();
	await screen.findByRole("heading", { name: "Engineer" });
	expect(view.container.querySelector("aside")?.contains(screen.getByRole("button", { name: "Open workspace" }))).toBe(
		true,
	);
});

it("keeps closure failure visible with the selected reason until acknowledgement", async () => {
	const view = mount();
	await screen.findByRole("heading", { name: "Engineer" });
	fireEvent.click(screen.getByRole("button", { name: "More actions" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Close application…" }));
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(api.close).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "More actions" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Close application…" }));
	fireEvent.click(screen.getByRole("radio", { name: "I withdrew" }));
	fireEvent.click(screen.getByRole("button", { name: "Close application" }));
	expect(api.close).toHaveBeenCalledExactlyOnceWith(application, "withdrew");
	expect(screen.getByRole("dialog")).toBeTruthy();
	api.error = new Error("offline");
	api.variables = { status: "closed" };
	assert(clients[0]);
	view.rerender(
		<QueryClientProvider client={clients[0]}>
			<I18nProvider i18n={i18n}>
				<ApplicationDetailPage applicationId={application.id} />
			</I18nProvider>
		</QueryClientProvider>,
	);
	expect(screen.getByRole("alert")).toHaveTextContent("Your reason is kept");
	expect(screen.getByRole("radio", { name: "I withdrew" })).toHaveAttribute("aria-checked", "true");
	clients[0].setQueryData(["application", application.id], {
		...application,
		status: "closed",
		closedReason: "withdrew",
	});
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("does not present a failed stage move as a closure failure", async () => {
	api.error = new Error("offline");
	api.variables = { status: "interview" };
	mount();
	await screen.findByRole("heading", { name: "Engineer" });
	fireEvent.click(screen.getByRole("button", { name: "More actions" }));
	fireEvent.click(await screen.findByRole("menuitem", { name: "Close application…" }));
	expect(screen.queryByText("The application could not be closed.")).toBeNull();
});
