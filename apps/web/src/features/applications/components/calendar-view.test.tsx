// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { calendarItems } from "../calendar-test-fixtures";
const device = vi.hoisted(() => ({ phone: false }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({
	useBreakpoint: () => (device.phone ? "mobile" : "desktop"),
}));
vi.mock("@/features/career/shared", () => ({
	useCareerTime: () => ({ timeZone: "Asia/Riyadh" }),
	useNow: () => new Date("2026-11-18T00:00:00Z"),
}));
vi.mock("./interview-dialog", () => ({ InterviewDialog: () => null }));
import { ApplicationCalendar, ApplicationCalendarSkeleton } from "./calendar-view";
afterEach(cleanup);
beforeEach(() => {
	device.phone = false;
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
function mount() {
	const applications = calendarItems().map((item) => item.application);
	return render(
		<I18nProvider i18n={i18n}>
			<TooltipProvider>
				<ApplicationCalendar applications={applications} allApplications={applications} onOpen={vi.fn()} />
			</TooltipProvider>
		</I18nProvider>,
	);
}
it("limits the agenda to five interviews before grouping and can return to five", () => {
	mount();
	expect(document.querySelectorAll("[data-upcoming-interview]")).toHaveLength(5);
	fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
	expect(document.querySelectorAll("[data-upcoming-interview]")).toHaveLength(7);
	fireEvent.click(screen.getByRole("button", { name: "Show next 5" }));
	expect(document.querySelectorAll("[data-upcoming-interview]")).toHaveLength(5);
	expect(screen.getByText("Asia/Riyadh")).toBeVisible();
});
it("labels month, grid and upcoming counts separately", () => {
	mount();
	expect(screen.getByText("7 interviews this month")).toBeVisible();
	expect(screen.getByText("7 in the grid")).toBeVisible();
	expect(screen.getByText("7 upcoming")).toBeVisible();
});

it("mobile_starts_with_week_and_five_rows", () => {
	device.phone = true;
	mount();
	const calendar = document.querySelector(".application-calendar");
	expect(calendar?.firstElementChild).toHaveAttribute("data-calendar-week");
	expect(document.querySelectorAll("[data-upcoming-interview]")).toHaveLength(5);
	expect(screen.queryByTestId("interview-calendar")).toBeNull();
	expect(screen.getByRole("button", { name: /Show month/ })).toHaveAttribute("aria-expanded", "false");
});
it("month_disclosure_preserves_agenda_expansion", () => {
	device.phone = true;
	mount();
	fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
	fireEvent.click(screen.getByRole("button", { name: /Show month/ }));
	expect(screen.getByTestId("interview-calendar")).toBeVisible();
	expect(document.querySelectorAll("[data-upcoming-interview]")).toHaveLength(7);
	fireEvent.click(screen.getByRole("button", { name: /Hide month/ }));
	expect(document.querySelectorAll("[data-upcoming-interview]")).toHaveLength(7);
});

it("keeps the calendar pending regions separate from an empty result", () => {
	const { container } = render(<ApplicationCalendarSkeleton />);
	expect(container.querySelector(".application-calendar")).toBeTruthy();
	expect(container.querySelector(".calendar-month-panel")).toBeTruthy();
	expect(container.querySelector(".calendar-agenda")).toBeTruthy();
	expect(screen.queryByText("Nothing scheduled yet")).toBeNull();
});
