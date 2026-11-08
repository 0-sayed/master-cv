import assert from "node:assert/strict";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { OTPField } from "./otp-field";
describe("OTPField", () => {
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
