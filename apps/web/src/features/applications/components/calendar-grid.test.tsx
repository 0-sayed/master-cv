// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { calendarItems } from "../calendar-test-fixtures";
import { dayKey, groupByDay, monthGrid } from "../interviews";
import { CalendarGrid } from "./calendar-grid";
afterEach(cleanup);
beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
function mount(direction: "ltr" | "rtl" = "ltr", items = calendarItems(), compact = false) {
	const onMonthChange = vi.fn();
	const onEdit = vi.fn();
	const onSchedule = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<DirectionProvider direction={direction}>
				<TooltipProvider>
					<CalendarGrid
						month={new Date(2026, 10, 1)}
						days={monthGrid(new Date(2026, 10, 1))}
						byDay={groupByDay(items, "Asia/Riyadh")}
						todayKey="2026-11-18"
						locale="en-US"
						timeZone="Asia/Riyadh"
						compact={compact}
						onMonthChange={onMonthChange}
						onEdit={onEdit}
						onSchedule={onSchedule}
					/>
				</TooltipProvider>
			</DirectionProvider>
		</I18nProvider>,
	);
	return { onMonthChange, onEdit, onSchedule };
}
it("one_grid_tab_stop", () => {
	mount();
	const grid = screen.getByRole("grid");
	expect(grid.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
	expect(grid.querySelectorAll('button:not([tabindex="-1"])')).toHaveLength(0);
});
it.each(["ltr", "rtl"] as const)("directional_arrows_and_week_edges (%s)", async (direction) => {
	mount(direction);
	const today = screen.getByRole("gridcell", { current: "date" });
	fireEvent.keyDown(today, { key: "ArrowDown" });
	await waitFor(() => expect(document.activeElement).toHaveAttribute("data-day", "2026-11-25"));
	fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight" });
	await waitFor(() =>
		expect(document.activeElement).toHaveAttribute("data-day", direction === "ltr" ? "2026-11-26" : "2026-11-24"),
	);
});
it("daily_events_restore_focus", async () => {
	const { onSchedule } = mount();
	const cell = screen.getByRole("gridcell", { current: "date" });
	fireEvent.keyDown(cell, { key: "Enter" });
	expect(await screen.findByRole("dialog")).toHaveTextContent("Example 0");
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await waitFor(() => expect(cell).toHaveFocus());
	fireEvent.keyDown(cell, { key: " " });
	fireEvent.click(await screen.findByRole("button", { name: "Schedule interview" }));
	expect(dayKey(onSchedule.mock.calls[0]?.[0])).toBe("2026-11-18");
});
it.each([false, true])("busy adjacent dates retain all interviews (compact: %s)", async (compact) => {
	const items = calendarItems(4).map((item) => ({ ...item, start: new Date("2026-12-01T10:00:00Z") }));
	mount("ltr", items, compact);
	const cell = document.querySelector<HTMLElement>('[data-day="2026-12-01"]');
	if (!cell) throw new Error("Missing adjacent date");
	expect(cell).toHaveAttribute("data-outside", "true");
	expect(cell.querySelectorAll('[data-calendar-event="chip"]')).toHaveLength(compact ? 0 : 3);
	fireEvent.keyDown(cell, { key: "Enter" });
	const dialog = await screen.findByRole("dialog");
	expect(dialog.querySelectorAll('[data-calendar-event="detail"]')).toHaveLength(4);
	fireEvent.keyDown(dialog, { key: "Escape" });
	await waitFor(() => expect(cell).toHaveFocus());
});
it("empty dates retain scheduling and navigation crosses the visible range", async () => {
	const { onMonthChange } = mount();
	const last = document.querySelector<HTMLElement>('[data-day="2026-12-12"]');
	if (!last) throw new Error("Missing final cell");
	fireEvent.keyDown(last, { key: "ArrowRight" });
	expect(dayKey(onMonthChange.mock.calls[0]?.[0])).toBe("2026-12-01");
	const empty = document.querySelector<HTMLElement>('[data-day="2026-11-01"]');
	if (!empty) throw new Error("Missing empty cell");
	fireEvent.keyDown(empty, { key: "Enter" });
	expect(await screen.findByRole("button", { name: "Schedule interview" })).toBeVisible();
});
