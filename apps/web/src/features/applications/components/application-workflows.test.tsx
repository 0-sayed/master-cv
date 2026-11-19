// @vitest-environment happy-dom
import type { Application } from "../types";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Retained integration behavior is qualified separately from the default-off product gate.
vi.mock("@reactive-resume/schema/personal-tools", async (original) => ({
	...(await original<typeof import("@reactive-resume/schema/personal-tools")>()),
	isFeatureAvailable: () => true,
}));

const api = vi.hoisted(() => ({
	breakpoint: "desktop",
	bulkDelete: vi.fn(),
	bulkUpdate: vi.fn(),
	parsePosting: vi.fn(),
	create: vi.fn(),
	moveTo: vi.fn(),
	close: vi.fn(),
	remove: vi.fn(),
	invalidate: vi.fn(),
	confirm: vi.fn(),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { applications: { ai: { parsePosting: api.parsePosting } } },
	orpc: {
		applications: {
			bulkDelete: { mutationOptions: () => ({ mutationFn: api.bulkDelete }) },
			bulkUpdate: { mutationOptions: () => ({ mutationFn: api.bulkUpdate }) },
			create: { mutationOptions: () => ({ mutationFn: api.create }) },
			ai: {
				parsePosting: { mutationOptions: () => ({ mutationFn: api.parsePosting }) },
				searchPostings: { mutationOptions: () => ({ mutationFn: async () => [] }) },
			},
		},
		webAccess: {
			status: { queryOptions: () => ({ queryKey: ["web-access"], queryFn: async () => ({ search: false }) }) },
		},
		documents: { list: { queryOptions: () => ({ queryKey: ["documents"], queryFn: async () => [] }) } },
	},
}));
vi.mock("../use-application-actions", () => ({
	useInvalidateApplications: () => api.invalidate,
	useApplicationActions: () => ({ moveTo: api.moveTo, close: api.close, remove: { mutate: api.remove } }),
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => api.confirm }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => api.breakpoint }));
vi.mock("@/features/settings/integrations/hooks/use-has-usable-ai-provider", () => ({
	useHasUsableAiProvider: () => ({ hasUsableProvider: true }),
}));
vi.mock("@/dialogs/store", () => ({ useDialogStore: () => vi.fn() }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));

import { AddApplicationDialog } from "./add-application-dialog";
import { ApplicationBoard } from "./board";
import { ApplicationList } from "./list-view";

const application = (id: string, status: Application["status"]): Application => ({
	id,
	company: id === "closed" ? "Closed Co" : "Open Co",
	role: "Engineer",
	status,
	closedReason: status === "closed" ? "not-selected" : null,
	coverLetterId: null,
	selectedResumeVersionId: null,
	sentResumeRecordedAt: null,
	sentResumeVersionId: null,
	sentCoverLetterVersionId: null,
	sentCheckScore: null,
	requirements: [],
	location: null,
	salary: null,
	source: null,
	sourceUrl: null,
	notes: null,
	tags: [],
	contacts: [],
	activity: [],
	appliedAt: new Date(),
	createdAt: new Date(),
	updatedAt: new Date(),
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
});
const clients: QueryClient[] = [];
const mount = (children: ReactNode) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	clients.push(client);
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>{children}</I18nProvider>
		</QueryClientProvider>
	);
	return render(children, { wrapper });
};
beforeEach(() => {
	vi.clearAllMocks();
	api.breakpoint = "desktop";
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	api.confirm.mockResolvedValue(true);
	api.bulkDelete.mockResolvedValue({ deleted: 1 });
});
afterEach(() => {
	cleanup();
	clients.splice(0).forEach((client) => client.clear());
});

it.each(["desktop", "mobile"])("selects and clears rows through the floating toolbar on %s", (breakpoint) => {
	api.breakpoint = breakpoint;
	const onOpen = vi.fn();
	const view = mount(
		<ApplicationList applications={[application("open", "saved")]} showClosed={false} onOpen={onOpen} />,
	);
	fireEvent.click(screen.getByRole("checkbox", { name: "Select Engineer at Open Co" }));
	const toolbar = screen.getByRole("toolbar", { name: "Selected applications" });
	expect(view.container.contains(toolbar)).toBe(false);
	expect(toolbar.className).toContain("fixed");
	expect(onOpen).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
	expect(screen.queryByRole("toolbar")).toBeNull();
	expect(screen.getByRole("checkbox", { name: "Select Engineer at Open Co" })).not.toBeChecked();
});

it("removes hidden closed applications from bulk selection before deleting visible rows", async () => {
	const rows = [application("open", "saved"), application("closed", "closed")];
	const view = mount(<ApplicationList applications={rows} showClosed onOpen={vi.fn()} />);
	fireEvent.click(screen.getByRole("checkbox", { name: "Select Engineer at Open Co" }));
	fireEvent.click(screen.getByRole("checkbox", { name: "Select Engineer at Closed Co" }));
	expect(screen.getByText("2 selected")).toBeTruthy();
	view.rerender(<ApplicationList applications={rows} showClosed={false} onOpen={vi.fn()} />);
	expect(screen.queryByRole("checkbox", { name: "Select Engineer at Closed Co" })).toBeNull();
	expect(screen.getByText("1 selected")).toBeTruthy();
	fireEvent.click(screen.getByRole("button", { name: "Delete…" }));
	await waitFor(() => expect(api.bulkDelete.mock.calls[0]?.[0]).toEqual({ ids: ["open"] }));
});

it("offers one board-card open control and a separate options control without a dead draggable tab stop", async () => {
	const row = application("open", "saved");
	const onOpen = vi.fn();
	const view = mount(<ApplicationBoard applications={[row]} showClosed={false} onOpen={onOpen} />);
	const open = screen.getByRole("button", { name: "Engineer Open Co" });
	const options = screen.getByRole("button", { name: "More actions" });
	expect(view.container.querySelector("button button, [role=button] button")).toBeNull();
	for (let parent = open.parentElement; parent && parent !== view.container; parent = parent.parentElement) {
		expect(parent.tabIndex).toBeLessThan(0);
	}
	fireEvent.click(open);
	expect(onOpen).toHaveBeenCalledExactlyOnceWith(row);
	fireEvent.click(options);
	await screen.findByRole("menu");
	expect(onOpen).toHaveBeenCalledTimes(1);
});

it.each(["ai", "page"])(
	"does not report successful %s extraction when role and company are blank",
	async (filledBy) => {
		api.parsePosting.mockResolvedValue({
			role: "",
			company: "",
			location: "",
			salary: "",
			requirements: [],
			jobDescription: "A general careers landing page",
			filledBy,
			postingSource: { method: "fetch", format: "text", truncated: false, completeness: "unknown" },
		});
		mount(<AddApplicationDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
		fireEvent.change(await screen.findByRole("textbox", { name: "Job link" }), {
			target: { value: "https://example.test/careers" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Read job" }));
		await screen.findByText(/Some job details couldn't be read/);
		expect(screen.queryByText(/Found (the )?role,? (and )?company/)).toBeNull();
		expect((screen.getByRole("button", { name: "Save job" }) as HTMLButtonElement).disabled).toBe(false);
		expect(screen.getByText("A general careers landing page")).toBeTruthy();
		fireEvent.change(screen.getByRole("textbox", { name: "Role" }), { target: { value: "Engineer" } });
		fireEvent.change(screen.getByRole("textbox", { name: "Company" }), { target: { value: "Known Company" } });
		expect((screen.getByRole("button", { name: "Save job" }) as HTMLButtonElement).disabled).toBe(false);
	},
);

it("switches a blocked link to paste mode without retaining a junk description", async () => {
	api.parsePosting.mockRejectedValue(new ORPCError("POSTING_SIGN_IN_REQUIRED", { status: 422 }));
	mount(<AddApplicationDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
	fireEvent.change(screen.getByRole("textbox", { name: "Job link" }), {
		target: { value: "https://jobs.example/123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Read job" }));
	await screen.findByText("This site needs you to be signed in. Paste the job description instead.");
	expect(screen.getByRole("tab", { name: "Paste text" }).getAttribute("aria-selected")).toBe("true");
	expect(
		Number((screen.getByRole("textbox", { name: "Job description" }) as HTMLTextAreaElement).rows),
	).toBeGreaterThanOrEqual(8);
	expect(screen.queryByText("Saved description")).toBeNull();
});

it("keeps a long retrieved description collapsed until requested and enables tailoring with valid details", async () => {
	api.parsePosting.mockResolvedValue({
		role: "Engineer",
		company: "Example",
		location: "Riyadh, Saudi Arabia",
		salary: "",
		requirements: [],
		jobDescription: "Build useful tools.\n".repeat(50),
		filledBy: "page",
		postingSource: { method: "builtin", format: "text", truncated: false, completeness: "unknown" },
	});
	mount(<AddApplicationDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
	fireEvent.change(screen.getByRole("textbox", { name: "Job link" }), {
		target: { value: "https://jobs.example/123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Read job" }));
	const expand = await screen.findByRole("button", { name: "Show all" });
	expect(expand.getAttribute("aria-expanded")).toBe("false");
	expect((screen.getByRole("textbox", { name: "Role" }) as HTMLInputElement).value).toBe("Engineer");
	expect((screen.getByRole("button", { name: "Save and tailor CV" }) as HTMLButtonElement).disabled).toBe(false);
	fireEvent.click(expand);
	expect(screen.getByRole("button", { name: "Show less" }).getAttribute("aria-expanded")).toBe("true");
});

it("saves pasted text without a reader or provider call", async () => {
	api.create.mockResolvedValue("saved-job");
	mount(<AddApplicationDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
	fireEvent.click(screen.getByRole("tab", { name: "Paste text" }));
	fireEvent.change(screen.getByRole("textbox", { name: "Job description" }), {
		target: { value: "Build accessible tools for learners." },
	});
	fireEvent.change(screen.getByRole("textbox", { name: "Role" }), { target: { value: "Engineer" } });
	fireEvent.change(screen.getByRole("textbox", { name: "Company" }), { target: { value: "Example" } });
	fireEvent.click(screen.getByRole("button", { name: "Save job" }));
	await waitFor(() =>
		expect(api.create).toHaveBeenCalledWith(
			expect.objectContaining({ jobDescription: "Build accessible tools for learners." }),
			expect.anything(),
		),
	);
	expect(api.parsePosting).not.toHaveBeenCalled();
});

it("announces reading and preserves details edited while the request is pending", async () => {
	let finish!: (result: object) => void;
	api.parsePosting.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	mount(<AddApplicationDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
	fireEvent.change(screen.getByRole("textbox", { name: "Job link" }), {
		target: { value: "https://jobs.example/123" },
	});
	fireEvent.click(screen.getByRole("button", { name: "Read job" }));
	await screen.findByText("Reading the link…");
	expect((screen.getByRole("button", { name: "Save and tailor CV" }) as HTMLButtonElement).disabled).toBe(false);
	fireEvent.change(screen.getByRole("textbox", { name: "Role" }), { target: { value: "My edited role" } });
	finish({
		role: "Engineer",
		company: "Example",
		location: "Riyadh",
		salary: "",
		requirements: [],
		jobDescription: "Build accessible tools.",
		filledBy: "page",
		postingSource: { method: "builtin", format: "text", truncated: false, completeness: "unknown" },
	});
	await screen.findByRole("button", { name: "Show all" });
	expect((screen.getByRole("textbox", { name: "Role" }) as HTMLInputElement).value).toBe("My edited role");
	expect((screen.getByRole("textbox", { name: "Company" }) as HTMLInputElement).value).toBe("Example");
	expect((screen.getByRole("button", { name: "Save and tailor CV" }) as HTMLButtonElement).disabled).toBe(false);
});

it("explains missing job details on empty submission without creating a job", async () => {
	mount(<AddApplicationDialog open onOpenChange={vi.fn()} onAdded={vi.fn()} />);
	const submit = screen.getByRole("button", { name: "Save job" });
	expect(submit).not.toBeDisabled();
	fireEvent.click(submit);
	await waitFor(() => expect(screen.getByRole("textbox", { name: "Role" })).toHaveFocus());
	expect(screen.getAllByRole("alert")).toHaveLength(2);
	expect(api.create).not.toHaveBeenCalled();
});
