// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { LocalDateInput } from "./local-date-input";
afterEach(cleanup);
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
