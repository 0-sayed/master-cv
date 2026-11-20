import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Input } from "./input";
import { InputGroup, InputGroupInput } from "./input-group";
import { Textarea } from "./textarea";

it.each(["email", "tel"])("keeps the interface placeholder direction and LTR typed %s values", (type) => {
	const view = render(
		<DirectionProvider direction="rtl">
			<Input aria-label="Contact" type={type} placeholder="https://example.test" />
		</DirectionProvider>,
	);
	const input = screen.getByLabelText<HTMLInputElement>("Contact");
	expect(input.value).toBe("");
	expect(input.style.getPropertyValue("--field-interface-direction")).toBe("rtl");
	expect(input).toHaveClass("field-direction");
	fireEvent.change(input, { target: { value: "example123" } });
	expect(input.value).toBe("example123");
	expect(input).toHaveAttribute("dir", "ltr");
	fireEvent.change(input, { target: { value: "" } });
	expect(input.style.getPropertyValue("--field-interface-direction")).toBe("rtl");
	view.rerender(
		<DirectionProvider direction="ltr">
			<Input aria-label="Contact" type={type} placeholder="Email" />
		</DirectionProvider>,
	);
	expect(input.style.getPropertyValue("--field-interface-direction")).toBe("ltr");
});

it.each(["email", "url", "tel", "password", "number", "date"])("isolates a %s field in an Arabic interface", (type) => {
	render(
		<div dir="rtl">
			<Input aria-label="Technical value" type={type} />
		</div>,
	);
	expect(screen.getByLabelText("Technical value")).toHaveAttribute("dir", "ltr");
});
it.each(["username", "one-time-code"])("isolates autocomplete=%s in an input group", (autoComplete) => {
	render(
		<div dir="rtl">
			<InputGroup>
				<InputGroupInput aria-label="Technical value" autoComplete={autoComplete} />
			</InputGroup>
		</div>,
	);
	expect(screen.getByLabelText("Technical value")).toHaveAttribute("dir", "ltr");
});
it.each(["username", "phone", "email", "url", "verificationCode"])("isolates a technical %s field name", (name) => {
	render(<Input aria-label="Technical value" name={name} />);
	expect(screen.getByLabelText("Technical value")).toHaveAttribute("dir", "ltr");
});
it("uses automatic direction for natural text and respects explicit overrides", () => {
	render(
		<>
			<Input aria-label="Name" />
			<Input aria-label="Override" type="url" dir="auto" />
			<Textarea aria-label="Posting" placeholder="https://…" />
		</>,
	);
	expect(screen.getByLabelText("Name")).toHaveAttribute("dir", "auto");
	expect(screen.getByLabelText("Override")).toHaveAttribute("dir", "auto");
	expect(screen.getByLabelText("Posting")).toHaveAttribute("dir", "auto");
});
