// @vitest-environment happy-dom
import type { Application } from "../../types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
const api = vi.hoisted(() => ({ add: vi.fn(), save: vi.fn(), edit: vi.fn(), remove: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: {
			addNote: { mutationOptions: () => ({ mutationFn: api.add }) },
			update: { mutationOptions: () => ({ mutationFn: api.save }) },
			updateTimelineEntry: { mutationOptions: () => ({ mutationFn: api.edit }) },
			deleteTimelineEntry: { mutationOptions: () => ({ mutationFn: api.remove }) },
			getById: { queryKey: () => ["application", "a"] },
		},
	},
}));
vi.mock("../../use-application-actions", () => ({ useInvalidateApplications: () => vi.fn() }));
vi.mock("@/hooks/use-current-session", () => ({ useCurrentSession: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn() }));
const { Activity } = await import("./activity");
const { NoteComposer } = await import("./note-composer");
const { useApplicationNotes } = await import("../application-notes");
const application = {
	id: "a",
	status: "applied",
	notes: "Legacy محفوظ",
	updatedAt: new Date("2026-11-18"),
	activity: [{ id: "n", type: "note", text: "Timeline محفوظ", at: new Date("2026-11-17") }],
} as unknown as Application;
function show(children: React.ReactNode) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	return render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
				{children}
			</QueryClientProvider>
		</I18nProvider>,
	);
}
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.clearAllMocks();
});
it("uses one composer without merging legacy and timeline storage", async () => {
	api.add.mockResolvedValue({});
	api.save.mockResolvedValue({ ...application, notes: "Edited legacy", updatedAt: new Date("2026-11-19") });
	show(<Activity application={application} onOpenInterview={vi.fn()} />);
	expect(screen.getAllByRole("textbox")).toHaveLength(1);
	expect(screen.getByText("Application note")).toBeTruthy();
	expect(screen.getByText("Timeline محفوظ")).toBeTruthy();
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "New timeline note" } });
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	await waitFor(() => expect(api.add.mock.calls.at(0)?.[0]).toEqual({ id: "a", text: "New timeline note" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit application note" }));
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Edited legacy" } });
	fireEvent.click(screen.getByRole("button", { name: "Save application note" }));
	await waitFor(() =>
		expect(api.save.mock.calls.at(0)?.[0]).toEqual({
			id: "a",
			notes: "Edited legacy",
			expectedNotesRevision: application.updatedAt.toISOString(),
			expectedUpdatedAt: application.updatedAt.toISOString(),
		}),
	);
});
it("retains failed new notes and independent text between composer modes", async () => {
	api.add.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({});
	function Harness() {
		const legacy = useApplicationNotes(application);
		const [mode, onModeChange] = useState<"new" | "legacy">("new");
		return (
			<>
				<button onClick={() => onModeChange("legacy")}>Legacy</button>
				<NoteComposer application={application} legacy={legacy} mode={mode} onModeChange={onModeChange} />
			</>
		);
	}
	show(<Harness />);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Keep this draft" } });
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	await screen.findByRole("alert");
	expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
	fireEvent.click(screen.getByRole("button", { name: "Legacy" }));
	expect(screen.getByRole("textbox")).toHaveValue("Legacy محفوظ");
	fireEvent.click(screen.getByRole("button", { name: "New note" }));
	expect(screen.getByRole("textbox")).toHaveValue("Keep this draft");
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
});

it("recovers a legacy draft into the single composer and clears legacy through guarded update", async () => {
	localStorage.setItem(
		"application-notes:owner:a",
		JSON.stringify({
			version: 1,
			expiresAt: Date.now() + 60000,
			ownerId: "owner",
			documentId: "a",
			baseRevision: application.updatedAt.toISOString(),
			value: "Recovered legacy",
		}),
	);
	api.save.mockResolvedValue({ ...application, notes: null, updatedAt: new Date("2026-11-19") });
	show(<Activity application={application} onOpenInterview={vi.fn()} />);
	expect(screen.getAllByRole("textbox")).toHaveLength(1);
	expect(screen.getByRole("textbox")).toHaveValue("Recovered legacy");
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
	fireEvent.click(screen.getByRole("button", { name: "Save application note" }));
	await waitFor(() => expect(api.save.mock.calls.at(0)?.[0].notes).toBeNull());
	expect(api.remove).not.toHaveBeenCalled();
});

it("clears an empty note error on text and mode changes", () => {
	show(<Activity application={application} onOpenInterview={vi.fn()} />);
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Valid text" } });
	expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
	fireEvent.click(screen.getByRole("button", { name: "Add note" }));
	fireEvent.click(screen.getByRole("button", { name: "Edit application note" }));
	expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "false");
	expect(screen.queryByText("Enter a note.")).toBeNull();
});
