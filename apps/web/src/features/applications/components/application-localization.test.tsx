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
	useCareerTime: () => ({ relative: () => "خلال 1 ساعة" }),
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
	expect(screen.getByRole("link", { name: "انضمام" })).toHaveAttribute("href", "https://meet.example.test/interview");
});
it("translates chart labels and reverses the Arabic pipeline", () => {
	const { container } = show(<ApplicationInsights applications={[app(1), app(2), app(3)]} />);
	expect(container.textContent).not.toMatch(/Saved|Applied|Screening|Interview|Offer|[٠-٩۰-۹]/u);
	const chart = container.querySelector("svg");
	expect(chart).not.toBeNull();
	const flow =
		container.querySelector('svg[aria-label="مسار طلبات الوظائف"]') ?? container.querySelector('svg[direction="rtl"]');
	expect(flow).not.toBeNull();
	if (!flow) throw new Error("Pipeline chart was not rendered");
	const labels = [...flow.querySelectorAll("text")];
	const saved = labels.find((label) => label.textContent === "محفوظ");
	const offer = labels.find((label) => label.textContent === "عرض وظيفي");
	expect(Number(saved?.getAttribute("x"))).toBeGreaterThan(Number(offer?.getAttribute("x")));
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
