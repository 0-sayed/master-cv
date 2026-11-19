// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { TooltipProvider } from "@reactive-resume/ui/components/tooltip";
import { calendarItems } from "../calendar-test-fixtures";
import { CalendarEvent } from "./calendar-event";
afterEach(cleanup);
beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
it.each(["chip", "agenda", "detail"] as const)("opens the complete interview from %s", (presentation) => {
	const [item] = calendarItems(1);
	if (!item) throw new Error("Missing interview fixture");
	const onOpen = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<TooltipProvider delay={0}>
				<CalendarEvent item={item} timeZone="Asia/Riyadh" presentation={presentation} onOpen={onOpen} />
			</TooltipProvider>
		</I18nProvider>,
	);
	const button = screen.getByRole("button", { name: /Example 0/ });
	expect(button).toHaveAttribute("dir", "auto");
	expect(button.querySelectorAll('bdi[dir="auto"]')).toHaveLength(2);
	expect(button).toHaveAttribute("data-calendar-kind", "technical");
	expect(button.querySelector('[data-slot="icon"]')).toBeTruthy();
	fireEvent.click(button);
	expect(onOpen).toHaveBeenCalledTimes(1);
});
it("shows full context on keyboard focus without a native title", async () => {
	const [item] = calendarItems(1);
	if (!item) throw new Error("Missing interview fixture");
	render(
		<I18nProvider i18n={i18n}>
			<TooltipProvider delay={0}>
				<CalendarEvent item={item} timeZone="Asia/Riyadh" presentation="agenda" onOpen={vi.fn()} />
			</TooltipProvider>
		</I18nProvider>,
	);
	const button = screen.getByRole("button", { name: /Example 0/ });
	expect(button).not.toHaveAttribute("title");
	fireEvent.keyDown(document.body, { key: "Tab" });
	act(() => button.focus());
	expect(await screen.findByRole("tooltip")).toHaveTextContent("https://example.test/meet");
	expect(screen.getByRole("tooltip")).toHaveTextContent("1 hr");
});

it.each(["screening", "technical", "behavioral", "onsite", "other"] as const)(
	"uses a distinct accessible type for %s",
	(kind) => {
		const [original] = calendarItems(1);
		if (!original) throw new Error("Missing interview fixture");
		const item = {
			...original,
			interview: { ...original.interview, kind },
			application: {
				...original.application,
				company:
					"International Desert Observatory for Service Operations, Cross-Regional Reporting and Continuous Process Improvement",
				role: "مدير أول لتنسيق عمليات المنتجات وقياس جودة الخدمات وإدارة التغيير ونقل المعرفة بين الفرق الموزعة في المناطق",
			},
		};
		render(
			<I18nProvider i18n={i18n}>
				<TooltipProvider>
					<CalendarEvent item={item} timeZone="Asia/Riyadh" presentation="chip" onOpen={vi.fn()} />
				</TooltipProvider>
			</I18nProvider>,
		);
		const event = screen.getByRole("button");
		expect(event).toHaveAttribute("data-calendar-kind", kind);
		expect(event.querySelectorAll('bdi[dir="auto"]')).toHaveLength(2);
		expect(event).toHaveAccessibleName(new RegExp(kind, "i"));
	},
);
