// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { LocalDateInput } from "./local-date-input";
afterEach(cleanup);
it("accepts an ISO date typed into the localized date field", () => {
	const changed = vi.fn();
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale="en-US"
			value="2026-11-17"
			onValueChange={changed}
		/>,
	);
	fireEvent.change(screen.getByRole("textbox", { name: "Date" }), { target: { value: "2026-09-25" } });
	expect(changed).toHaveBeenLastCalledWith("2026-09-25");
});
it("selects a day from the month calendar and preserves the date-only value", async () => {
	const changed = vi.fn();
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale="en-US"
			value="2026-11-17"
			onValueChange={changed}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Choose a date." }));
	fireEvent.click(await screen.findByRole("button", { name: "Sunday, November 22, 2026" }));
	expect(changed).toHaveBeenCalledWith("2026-11-22");
});
it("moves the focused calendar day with arrow keys", async () => {
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale="en-US"
			value="2026-11-17"
			onValueChange={vi.fn()}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Choose a date." }));
	const nextDay = await screen.findByRole("button", { name: "Wednesday, November 18, 2026" });
	const selectedDay = screen.getByRole("button", { name: "Tuesday, November 17, 2026" });
	fireEvent.keyDown(selectedDay, { key: "ArrowRight" });
	await waitFor(() => expect(nextDay).toHaveFocus());
});
it("keeps an enabled calendar day in the tab order after changing month and year", async () => {
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale="en-US"
			value="2026-11-17"
			min="2025-12-05"
			max="2028-02-10"
			onValueChange={vi.fn()}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Choose a date." }));
	const [month, year] = screen.getAllByRole("combobox");
	if (!month || !year) throw new Error("Expected month and year controls");
	fireEvent.change(month, { target: { value: "11" } });
	const december2026 = await screen.findByRole("button", { name: "Tuesday, December 1, 2026" });
	expect(december2026).toHaveAttribute("tabindex", "0");
	expect(december2026).toBeEnabled();
	fireEvent.change(year, { target: { value: "2027" } });
	const december2027 = await screen.findByRole("button", { name: "Wednesday, December 1, 2027" });
	expect(december2027).toHaveAttribute("tabindex", "0");
	expect(december2027).toBeEnabled();
});
it("keeps focus on an enabled day when arrow movement reaches a date limit", async () => {
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale="en-US"
			value="2026-12-09"
			min="2026-12-05"
			max="2026-12-09"
			onValueChange={vi.fn()}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Choose a date." }));
	const lastEnabledDay = await screen.findByRole("button", { name: "Wednesday, December 9, 2026" });
	lastEnabledDay.focus();
	fireEvent.keyDown(lastEnabledDay, { key: "ArrowRight" });
	await waitFor(() => expect(lastEnabledDay).toHaveFocus());
	expect(lastEnabledDay).toHaveAttribute("tabindex", "0");
	expect(lastEnabledDay).toBeEnabled();
});
it("renders the day calendar in RTL for Arabic", async () => {
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale="ar-SA"
			value="2026-11-17"
			onValueChange={vi.fn()}
		/>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Choose a date." }));
	expect(await screen.findByRole("grid")).toHaveAttribute("dir", "rtl");
});
it.each(["ar-SA", "en-US"])("shows Gregorian dates with Latin digits in %s", (locale) => {
	render(
		<LocalDateInput
			aria-label="Date"
			calendarLabel="Choose a date."
			locale={locale}
			value="2026-11-17"
			onValueChange={vi.fn()}
		/>,
	);
	const value = (screen.getByRole("textbox") as HTMLInputElement).value;
	expect(value).not.toMatch(/[٠-٩۰-۹]/u);
	expect(value).toContain("2026");
	expect(value.startsWith(locale === "ar-SA" ? "17" : "11")).toBe(true);
});
it("preserves partial input and rejects impossible dates", () => {
	const changed = vi.fn();
	function Field() {
		const [value, setValue] = useState("");
		return (
			<LocalDateInput
				aria-label="Date"
				calendarLabel="Choose a date."
				locale="ar-SA"
				value={value}
				onValueChange={(next) => {
					setValue(next);
					changed(next);
				}}
			/>
		);
	}
	render(<Field />);
	const input = screen.getByRole("textbox");
	fireEvent.change(input, { target: { value: "31/02/2027" } });
	expect(changed).toHaveBeenLastCalledWith("");
	expect(input).toHaveValue("31/02/2027");
	fireEvent.change(input, { target: { value: "28/02/2027" } });
	expect(changed).toHaveBeenLastCalledWith("2027-02-28");
});

it.each(["٢٨/٠٢/٢٠٢٧", "۲۸/۰۲/۲۰۲۷"])("accepts pasted local digits %s", (text) => {
	const changed = vi.fn();
	function Field() {
		const [value, setValue] = useState("");
		return (
			<LocalDateInput
				aria-label="Date"
				calendarLabel="Choose a date."
				locale="ar-SA"
				value={value}
				onValueChange={(next) => {
					setValue(next);
					changed(next);
				}}
			/>
		);
	}
	render(<Field />);
	fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
	expect(changed).toHaveBeenLastCalledWith("2027-02-28");
	expect(screen.getByRole("textbox")).toHaveValue("28/02/2027");
});
