import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vite-plus/test";
import { createPortal } from "react-dom";
import { FormControl, FormItem, FormLabel } from "./form";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";

function PortaledInput() {
	return createPortal(<input aria-label="Portaled input" />, document.body);
}

describe("InputGroupAddon", () => {
	test("keeps a labelled group and its inner input when composed through FormControl", () => {
		render(
			<FormItem hasError>
				<FormLabel>Username</FormLabel>
				<FormControl
					render={
						<InputGroup dir="ltr">
							<InputGroupAddon>example.test/</InputGroupAddon>
							<InputGroupInput />
						</InputGroup>
					}
				/>
			</FormItem>,
		);
		const input = screen.getByRole("textbox", { name: "Username" });
		expect(input.closest('[data-slot="input-group"]')).toHaveAttribute("dir", "ltr");
		expect(input).toHaveAttribute("aria-invalid", "true");
	});

	test("keeps the grouped control identity when FormControl supplies its props", () => {
		render(
			<FormItem hasError>
				<FormLabel>Secret</FormLabel>
				<FormControl render={<InputGroupInput />} />
			</FormItem>,
		);

		const input = screen.getByRole("textbox", { name: "Secret" });
		expect(input).toHaveAttribute("data-slot", "input-group-control");
		expect(input).toHaveAttribute("aria-invalid", "true");
	});

	test("does not redirect focus from controls rendered through a portal", async () => {
		const user = userEvent.setup();

		render(
			<InputGroup>
				<InputGroupAddon align="inline-end">
					<span>Addon</span>
					<PortaledInput />
				</InputGroupAddon>

				<InputGroupInput aria-label="Outer input" />
			</InputGroup>,
		);

		const portaledInput = screen.getByLabelText("Portaled input");
		const outerInput = screen.getByLabelText("Outer input");

		await user.click(portaledInput);

		expect(document.activeElement).toBe(portaledInput);
		expect(document.activeElement).not.toBe(outerInput);
	});
});
