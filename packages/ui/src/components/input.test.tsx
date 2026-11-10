import { render, screen } from "@testing-library/react";
import { expect, it } from "vite-plus/test";
import { Input } from "./input";
import { InputGroup, InputGroupInput } from "./input-group";
import { Textarea } from "./textarea";

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
