// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { LocalDateInput } from "./local-date-input";
afterEach(cleanup);
it.each(["ar-SA", "en-US"])("shows Gregorian dates with Latin digits in %s", (locale) => {
	render(<LocalDateInput aria-label="Date" locale={locale} value="2026-11-17" onValueChange={vi.fn()} />);
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
