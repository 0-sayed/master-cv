import type { Application } from "../types";
// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ApplicationCalendar } from "./calendar-view";
import { ApplicationInsights } from "./insights-view";
import { getUiLocaleMessages } from "@/libs/locale";

vi.mock("./interview-dialog", () => ({ InterviewDialog: () => null }));
vi.mock("@/features/career/shared", () => ({
	useNow: () => new Date(),
	useCareerTime: () => ({ relative: () => "خلال 1 ساعة", timeZone: "Asia/Riyadh" }),
}));
vi.mock("@reactive-resume/ui/components/skeleton", () => ({ useSkeletonLoading: () => ({ pending: false }) }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: { stats: { queryOptions: () => ({ kind: "stats" }) } },
		documents: { list: { queryOptions: () => ({ kind: "documents" }) } },
	},
}));
vi.mock("@tanstack/react-query", () => ({
	useQuery: ({ kind }: { kind: string }) => ({
		data: kind === "documents" ? [] : { byStage: [{ status: "interview", count: 3 }], bySource: [] },
	}),
}));
beforeEach(async () => i18n.loadAndActivate(await getUiLocaleMessages("ar-SA")));
afterEach(cleanup);
const app = (index: number): Application =>
	({
		id: `app-${index}`,
		company: "شركة تجريبية",
		role: "مهندس",
		status: "interview",
		tags: [],
		activity: [
			{
				id: `interview-${index}`,
				type: "interview",
				kind: "screening",
				at: new Date(Date.now() + 86400000),
				durationMinutes: 60,
				location: "https://meet.example.test/interview",
				notes: "",
				participants: [],
			},
		],
		createdAt: new Date(),
		updatedAt: new Date(),
		stageEnteredAt: new Date(),
	}) as unknown as Application;
function show(node: React.ReactNode) {
	return render(<I18nProvider i18n={i18n}>{node}</I18nProvider>);
}
it("translates source enum labels in the Arabic calendar, agenda and legend", () => {
	const applications = [app(1)];
	const { container } = show(
		<ApplicationCalendar applications={applications} allApplications={applications} onOpen={vi.fn()} />,
	);
	expect(container.textContent).not.toMatch(/Screening|Technical|Behavioral|Onsite|Other|[٠-٩۰-۹]/u);
	expect(screen.getAllByText("الفحص").length).toBeGreaterThan(0);
	expect(screen.getAllByRole("button", { name: /شركة تجريبية/ })[0]).toHaveAttribute("dir", "auto");
});
it("translates complete chart labels and keeps weeks chronological in Arabic", () => {
	const { container } = show(<ApplicationInsights applications={[app(1), app(2), app(3), app(4), app(5)]} />);
	expect(container.textContent).not.toMatch(/Saved|Applied|Screening|Interview|Offer|[\u0660-\u0669\u06f0-\u06f9]/u);
	expect(container.querySelectorAll('[data-slot="insight-week"]')).toHaveLength(8);
	expect(container.querySelector('[data-slot="insight-week"]')?.parentElement).toHaveAttribute("dir", "ltr");
	expect(container.querySelector('svg[role="img"]')).toBeNull();
});

it("does not show an invalid response percentage when saved jobs have no submissions", () => {
	const applications = [app(1), app(2), app(3)].map((application) => ({
		...application,
		status: "saved" as const,
		activity: [],
	}));
	const { container } = show(<ApplicationInsights applications={applications} />);
	expect(container.textContent).not.toMatch(/NaN|Infinity/u);
});
it("uses a helpful low-data state instead of nearly empty charts", () => {
	const { container } = show(<ApplicationInsights applications={[app(1)]} />);
	expect(container.querySelector("svg[role=img]")).toBeNull();
	expect(container.textContent).toContain("طلبات");
});
