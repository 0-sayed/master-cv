import assert from "node:assert/strict";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { OTPField } from "./otp-field";
describe("OTPField", () => {
	it("uses one labelled autofill input with six decorative segments inside an LTR centred group", () => {
		render(
			<div dir="rtl">
				<label htmlFor="code">6-digit code</label>
				<OTPField id="code" length={6} />
			</div>,
		);
		const inputs = screen.getAllByRole("textbox");
		expect(inputs).toHaveLength(1);
		expect(screen.getByLabelText("6-digit code")).toBe(inputs[0]);
		expect(inputs[0]).toHaveAttribute("autocomplete", "one-time-code");
		expect(inputs[0]).toHaveAttribute("pattern", "[0-9]*");
		expect(inputs[0]?.parentElement).toHaveAttribute("dir", "ltr");
		expect(document.querySelectorAll('[data-slot="otp-field-segment"]')).toHaveLength(6);
	});
	it.each(["alpha", "alphanumeric", "none"] as const)("offers a text keyboard for %s codes", (validationType) => {
		render(<OTPField length={4} validationType={validationType} />);
		for (const input of screen.getAllByRole("textbox")) expect(input).toHaveAttribute("inputmode", "text");
	});
	it("accepts Arabic/Persian paste, preserves zero and does not submit by default", async () => {
		const submit = vi.fn((event) => event.preventDefault());
		function Field() {
			const [value, setValue] = useState("");
			return (
				<>
					<OTPField length={6} value={value} onValueChange={setValue} />
					<output>{value}</output>
				</>
			);
		}
		render(
			<form onSubmit={submit}>
				<Field />
			</form>,
		);
		const [input] = screen.getAllByRole("textbox");
		assert.ok(input);
		await userEvent.click(input);
		await userEvent.paste("٠۱۲٣٤۵");
		expect(screen.getByRole("status")).toHaveTextContent("012345");
		expect(submit).not.toHaveBeenCalled();
		expect(screen.getAllByRole("textbox")[0]).toHaveAttribute("inputmode", "numeric");
	});
});
