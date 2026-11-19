// @vitest-environment happy-dom
import type { Application } from "../../types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

it("separates mixed-language notes from dates and exposes visible entry menus", () => {
	show(<Activity application={application} onOpenInterview={vi.fn()} />);
	expect(screen.getByRole("heading", { name: "Activity", level: 2 })).toBeTruthy();
	const note = screen.getByText("Timeline محفوظ");
	expect(note.getAttribute("dir")).toBe("auto");
	expect(note.parentElement?.querySelector("time")).toBeTruthy();
	const menu = screen.getByRole("button", { name: "More actions" });
	expect(menu.className).not.toContain("opacity-0");
});
it("distinguishes an empty filter from empty history and keeps the composer", () => {
	show(<Activity application={application} onOpenInterview={vi.fn()} />);
	fireEvent.change(screen.getByRole("combobox", { name: "Activity type" }), { target: { value: "interview" } });
	expect(screen.getByText("No activity matches this filter")).toBeTruthy();
	expect(screen.getAllByRole("textbox")).toHaveLength(1);
	fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
	expect(screen.getByText("Timeline محفوظ")).toBeTruthy();
});

it("protects the current stage anchor after filtering", async () => {
	const stages = [{ id: "s1", type: "stage", stage: "applied", at: new Date("2026-11-16") }];
	show(
		<Activity
			application={{ ...application, activity: [...application.activity, ...stages] } as Application}
			onOpenInterview={vi.fn()}
		/>,
	);
	fireEvent.change(screen.getByRole("combobox", { name: "Activity type" }), { target: { value: "stage" } });
	fireEvent.click(screen.getByRole("button", { name: "More actions" }));
	expect(await screen.findByRole("menuitem", { name: "Delete…" })).toHaveAttribute("aria-disabled", "true");
});

it("shows interview participants and saved timezone without object coercion", () => {
	const entry = {
		id: "interview",
		type: "interview",
		kind: "onsite",
		at: new Date("2030-11-18"),
		durationMinutes: 45,
		timezone: "Asia/Riyadh",
		location: "مكتب Office",
		notes: "تحضير Prep",
		participants: [{ name: "اسم Name", role: "Recruiter" }],
		audience: "recruiter",
	};
	show(<Activity application={{ ...application, activity: [entry] } as Application} onOpenInterview={vi.fn()} />);
	expect(screen.getByText("اسم Name · Recruiter")).toBeTruthy();
	expect(screen.getByText(/Asia\/Riyadh/)).toHaveTextContent("45");
});
