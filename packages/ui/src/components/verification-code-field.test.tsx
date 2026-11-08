import assert from "node:assert/strict";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { useState } from "react";
import { VerificationCodeField } from "./verification-code-field";

describe("VerificationCodeField", () => {
	it("shows the current editing cell and selected digits, then clears the indicator on blur", async () => {
		render(<VerificationCodeField aria-label="Code" length={6} value="012345" onValueChange={vi.fn()} />);
		const input = screen.getByRole("textbox", { name: "Code" }) as HTMLInputElement;
		assert.ok(input.parentElement);
		const cells = input.parentElement.querySelectorAll('[data-slot="code-cell"]');
		await userEvent.click(input);
		await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}");
		expect(input.selectionStart).toBe(2);
		expect(cells[2]).toHaveAttribute("data-active");
		expect(cells[1]).not.toHaveAttribute("data-active");
		input.setSelectionRange(2, 4);
		fireEvent.select(input);
		expect(cells[2]).toHaveAttribute("data-active");
		expect(cells[3]).toHaveAttribute("data-active");
		expect(cells[4]).not.toHaveAttribute("data-active");
		await userEvent.tab();
		for (const cell of cells) expect(cell).not.toHaveAttribute("data-active");
	});
	it("keeps a read-only code immutable when the user pastes", async () => {
		const change = vi.fn();
		render(<VerificationCodeField aria-label="Code" length={6} value="012345" onValueChange={change} readOnly />);
		const input = screen.getByRole("textbox", { name: "Code" });
		await userEvent.click(input);
		await userEvent.paste("٩٨٧٦٥٤");
		expect(input).toHaveValue("012345");
		expect(change).not.toHaveBeenCalled();
	});
	it("uses one labelled input, normalizes a full paste and waits for explicit confirmation", async () => {
		const submit = vi.fn((event) => event.preventDefault());
		function Field() {
			const [value, setValue] = useState("");
			return (
				<form onSubmit={submit}>
					<label htmlFor="code">Code</label>
					<VerificationCodeField id="code" length={6} value={value} onValueChange={setValue} />
					<output>{value}</output>
					<button type="submit">Verify</button>
				</form>
			);
		}
		render(<Field />);
		const input = screen.getByRole("textbox", { name: "Code" });
		expect(screen.getAllByRole("textbox")).toHaveLength(1);
		expect(input.parentElement?.querySelectorAll('[data-slot="code-cell"][aria-hidden="true"]')).toHaveLength(6);
		await userEvent.click(input);
		await userEvent.paste("٠۱ ٢٣ ٤۵");
		expect(input).toHaveValue("012345");
		expect(input).toHaveAttribute("dir", "ltr");
		expect(input).toHaveAttribute("inputmode", "numeric");
		expect(submit).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole("button", { name: "Verify" }));
		expect(submit).toHaveBeenCalledOnce();
	});
	it("preserves native label/error association and supports replacing selected digits", async () => {
		function Field() {
			const [value, setValue] = useState("012345");
			return (
				<>
					<label htmlFor="code">Code</label>
					<VerificationCodeField
						id="code"
						length={6}
						value={value}
						onValueChange={setValue}
						aria-invalid
						aria-describedby="error"
					/>
					<p id="error">Incorrect code</p>
				</>
			);
		}
		render(<Field />);
		const input = screen.getByRole("textbox", { name: "Code" }) as HTMLInputElement;
		expect(input).toHaveAccessibleDescription("Incorrect code");
		await userEvent.click(input);
		input.setSelectionRange(0, 2);
		await userEvent.paste("٩٨");
		expect(input).toHaveValue("982345");
		await userEvent.clear(input);
		await userEvent.type(input, "١A٢۳4567");
		expect(input).toHaveValue("123456");
	});
});
