// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { PasswordInput } from "./password-input";

beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
afterEach(cleanup);

it.each([true, false])(
	"keeps the password value and field label while toggling visibility (embedded=%s)",
	(embedded) => {
		const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
		render(
			<I18nProvider i18n={i18n}>
				<form onSubmit={submit}>
					<label htmlFor="password">Account password</label>
					<PasswordInput
						id="password"
						embedded={embedded}
						defaultValue="Existing-value-123"
						autoComplete="current-password"
					/>
				</form>
			</I18nProvider>,
		);
		const input = screen.getByLabelText("Account password");
		expect(input.getAttribute("type")).toBe("password");
		fireEvent.click(screen.getByRole("button", { name: "Show password" }));
		expect(input.getAttribute("type")).toBe("text");
		expect(input).toHaveProperty("value", "Existing-value-123");
		expect(input.getAttribute("autocomplete")).toBe("current-password");
		fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
		expect(input.getAttribute("type")).toBe("password");
		expect(submit).not.toHaveBeenCalled();
	},
);
