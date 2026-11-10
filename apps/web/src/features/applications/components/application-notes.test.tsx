// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApplicationNotes } from "./application-notes";
const api = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: {
			update: { mutationOptions: () => ({ mutationFn: api.save }) },
			getById: { queryKey: ({ input }: { input: { id: string } }) => ["application", input.id] },
		},
	},
}));
vi.mock("@/hooks/use-current-session", () => ({ useCurrentSession: () => ({ user: { id: "notes-owner" } }) }));
vi.mock("../use-application-actions", () => ({ useInvalidateApplications: () => () => {} }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));
const application = { id: "notes-app", notes: "Server original", updatedAt: new Date("2026-11-01") };
function mount(value = application) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const view = render(<ApplicationNotes application={value} />, {
		wrapper: ({ children }) => (
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			</I18nProvider>
		),
	});
	return { ...view, client };
}
beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	sessionStorage.clear();
	api.save.mockReset();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
it("shows refreshed authoritative notes when there is no local edit", () => {
	const view = mount();
	view.rerender(
		<ApplicationNotes
			application={{ ...application, notes: "New server revision", updatedAt: new Date("2026-11-02") }}
		/>,
	);
	expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("New server revision");
});
it("retains a failed draft across a browser module reload", async () => {
	api.save.mockRejectedValue(new Error("offline"));
	mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Unsaved personal note" } });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(900);
	});
	// A fresh module has no access to the old module-level map. Durable storage must hold the draft.
	const stored = [...Array(localStorage.length)].map((_, index) => localStorage.getItem(localStorage.key(index) ?? ""));
	expect(stored.some((value) => value?.includes("Unsaved personal note"))).toBe(true);
});
it("recovers a failed draft from durable storage after remount", async () => {
	api.save.mockRejectedValue(new Error("offline"));
	const view = mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Recover me" } });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(900);
	});
	view.unmount();
	mount();
	expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Recover me");
});
it("keeps a local edit without overwriting a newer server revision", async () => {
	const view = mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "My draft" } });
	view.rerender(
		<ApplicationNotes
			application={{ ...application, notes: "Someone else's edit", updatedAt: new Date("2026-11-02") }}
		/>,
	);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(2000);
	});
	expect(api.save).not.toHaveBeenCalled();
	expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("My draft");
	fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
	expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Someone else's edit");
});
it("clears a draft only after the canonical response is acknowledged", async () => {
	let resolve!: (value: typeof application) => void;
	api.save.mockReturnValue(
		new Promise<typeof application>((accept) => {
			resolve = accept;
		}),
	);
	mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "  My note  " } });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(900);
	});
	expect(api.save.mock.calls[0]?.[0]).toMatchObject({ expectedNotesRevision: application.updatedAt.toISOString() });
	expect(Object.keys(localStorage).some((key) => key.startsWith("application-notes:"))).toBe(true);
	await act(async () => {
		resolve({ ...application, notes: "My note", updatedAt: new Date("2026-11-03") });
	});
	expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("My note");
	expect(Object.keys(localStorage).some((key) => key.startsWith("application-notes:"))).toBe(false);
});
it("does not erase a newer remounted draft when an earlier view's save finishes", async () => {
	let resolve!: (value: typeof application) => void;
	api.save.mockReturnValue(
		new Promise<typeof application>((accept) => {
			resolve = accept;
		}),
	);
	const earlier = mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Earlier submitted note" } });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(900);
	});
	earlier.unmount();
	mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Newer remounted draft" } });
	await act(async () => {
		resolve({ ...application, notes: "Earlier submitted note", updatedAt: new Date("2026-11-03") });
	});
	expect(localStorage.getItem("application-notes:notes-owner:notes-app")).toContain("Newer remounted draft");
	expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("Newer remounted draft");
});
it("does not replace a newer query revision with a delayed save response", async () => {
	let resolve!: (value: typeof application) => void;
	api.save.mockReturnValue(
		new Promise<typeof application>((accept) => {
			resolve = accept;
		}),
	);
	const view = mount();
	fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Earlier submitted note" } });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(900);
	});
	const fresh = { ...application, notes: "Newer server revision", updatedAt: new Date("2026-11-04") };
	view.client.setQueryData(["application", application.id], fresh);
	await act(async () => {
		resolve({ ...application, notes: "Earlier submitted note", updatedAt: new Date("2026-11-03") });
	});
	expect(view.client.getQueryData(["application", application.id])).toEqual(fresh);
});
