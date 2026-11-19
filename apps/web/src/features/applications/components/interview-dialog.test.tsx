// @vitest-environment happy-dom
import type { Application } from "../types";
import type { InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@reactive-resume/ui/components/toast";

const api = vi.hoisted(() => ({ add: vi.fn(), update: vi.fn(), remove: vi.fn(), read: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: {
			addInterview: { mutationOptions: (options: object) => ({ mutationFn: api.add, ...options }) },
			updateInterview: { mutationOptions: (options: object) => ({ mutationFn: api.update, ...options }) },
			deleteTimelineEntry: { mutationOptions: (options: object) => ({ mutationFn: api.remove, ...options }) },
			getById: { queryKey: () => ["application"] },
		},
		career: { schedules: { queryOptions: () => ({ queryKey: ["schedules"], queryFn: async () => [] }) } },
	},
}));
vi.mock("../queries", () => ({ applicationsListQueryKey: () => ["applications"] }));
vi.mock("@tanstack/react-router", () => ({
	useRouteContext: () => ({ session: { user: { id: "interview-test", timezone: "Europe/Berlin" } } }),
}));

import { InterviewDialog } from "./interview-dialog";

const interview: InterviewTimelineEntry = {
	id: "original-round",
	type: "interview",
	at: new Date("2027-03-27T10:00:00Z"),
	kind: "technical",
	durationMinutes: 60,
	location: "Office",
	notes: "Original preparation notes",
	participants: [],
	audience: "hiring-manager",
	timezone: "Europe/Berlin",
};
const application: Application = {
	id: "application",
	company: "Example Co",
	role: "Engineer",
	status: "interview",
	closedReason: null,
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
	activity: [interview],
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
};
const clients: QueryClient[] = [];
function Harness({ editing }: { editing: boolean }) {
	const [open, setOpen] = useState(true);
	const { data } = useQuery({ queryKey: ["applications"], queryFn: api.read });
	const loaded = (data as Application[] | undefined)?.[0];
	return (
		<>
			<output aria-label="Saved round identity">
				{loaded?.activity.map((entry) => entry.id).join(",") ?? "Loading"}
			</output>
			<InterviewDialog
				open={open}
				onOpenChange={setOpen}
				application={application}
				interview={editing ? interview : null}
			/>
		</>
	);
}
function mount(editing: boolean) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	clients.push(client);
	return render(
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<Toaster>
					<Harness editing={editing} />
				</Toaster>
			</I18nProvider>
		</QueryClientProvider>,
	);
}
beforeEach(() => {
	vi.clearAllMocks();
	api.read.mockResolvedValue([application]);
	api.add.mockResolvedValue(application);
	api.update.mockResolvedValue(application);
	api.remove.mockResolvedValue(application);
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
afterEach(() => {
	cleanup();
	clients.splice(0).forEach((client) => client.clear());
});

it("keeps scheduling enabled and focuses the missing application after submit", async () => {
	const client = new QueryClient();
	clients.push(client);
	render(
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<InterviewDialog open onOpenChange={vi.fn()} applications={[application]} />
			</I18nProvider>
		</QueryClientProvider>,
	);
	const save = screen.getByRole("button", { name: "Save interview" });
	expect(save).not.toBeDisabled();
	fireEvent.click(save);
	const picker = screen.getByRole("combobox", { name: /Application/ });
	await waitFor(() => expect(picker).toHaveFocus());
	expect(picker).toHaveAttribute("aria-invalid", "true");
	expect(screen.getByRole("alert")).toHaveTextContent("Choose an application.");
	expect(api.add).not.toHaveBeenCalled();
});

it("preselects the application when scheduling from its details", async () => {
	mount(false);
	expect(screen.queryByRole("combobox", { name: /Application/ })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Save interview" }));
	await waitFor(() =>
		expect(api.add).toHaveBeenCalledWith(expect.objectContaining({ id: application.id }), expect.anything()),
	);
});

it.each([false, true])(
	"rejects nonexistent Berlin DST time before sending an interview mutation (editing: %s)",
	async (editing) => {
		mount(editing);
		fireEvent.change(await screen.findByLabelText(/^Date/), { target: { value: "03/28/2027" } });
		const time = screen.getByLabelText(/^Time/);
		fireEvent.change(time, { target: { value: "02:30" } });
		const save = screen.getByRole("button", { name: "Save interview" });
		expect(save).not.toBeDisabled();
		fireEvent.click(save);
		await waitFor(() => expect(time).toHaveFocus());
		expect(time).toHaveAttribute("aria-invalid", "true");
		expect(api.add).not.toHaveBeenCalled();
		expect(api.update).not.toHaveBeenCalled();
	},
);

it("keeps the saved round until deletion is explicitly confirmed and acknowledged", async () => {
	let acknowledge!: (value: Application) => void;
	api.remove.mockImplementation(
		() =>
			new Promise<Application>((resolve) => {
				acknowledge = resolve;
			}),
	);
	mount(true);
	await waitFor(() => expect(api.read).toHaveBeenCalled());
	fireEvent.click(await screen.findByRole("button", { name: /^Delete$/ }));
	const confirm = await screen.findByRole("button", { name: "Confirm" });
	expect(api.remove).not.toHaveBeenCalled();
	expect(screen.getByLabelText("Saved round identity").textContent).toBe("original-round");
	fireEvent.click(confirm);
	await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
	expect(api.remove.mock.calls[0]?.[0]).toEqual({ id: "application", entryId: "original-round" });
	expect(screen.getByRole("dialog", { name: "Edit interview" })).toBeTruthy();
	expect(screen.getByLabelText("Saved round identity").textContent).toBe("original-round");
	const deleted = { ...application, activity: [] };
	api.read.mockResolvedValue([deleted]);
	acknowledge(deleted);
	await waitFor(() => expect(api.read.mock.calls.length).toBeGreaterThan(1));
	await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit interview" })).toBeNull());
	expect(screen.getByLabelText("Saved round identity").textContent).toBe("");
	expect(api.add).not.toHaveBeenCalled();
	expect(api.update).not.toHaveBeenCalled();
});

it.each(["https://example.test/room", "javascript:alert(1)", "Office"])(
	"keeps safe interview access for %s",
	(location) => {
		const client = new QueryClient();
		clients.push(client);
		const onOpenApplication = vi.fn();
		render(
			<QueryClientProvider client={client}>
				<I18nProvider i18n={i18n}>
					<InterviewDialog
						open
						onOpenChange={vi.fn()}
						application={application}
						interview={{ ...interview, location }}
						onOpenApplication={onOpenApplication}
					/>
				</I18nProvider>
			</QueryClientProvider>,
		);
		if (location.startsWith("https:")) {
			expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("href", location);
			expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("rel", "noopener noreferrer");
		} else expect(screen.queryByRole("link", { name: "Join" })).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "View application" }));
		expect(onOpenApplication).toHaveBeenCalledWith(application);
	},
);

it("shows the interview timezone in its summary even when the account uses another zone", () => {
	const client = new QueryClient();
	clients.push(client);
	render(
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<InterviewDialog
					open
					onOpenChange={vi.fn()}
					application={application}
					interview={{ ...interview, timezone: "America/New_York" }}
				/>
			</I18nProvider>
		</QueryClientProvider>,
	);
	expect(screen.getByText(/America\/New_York/, { selector: "bdi" })).toHaveTextContent("6:00 AM");
});
