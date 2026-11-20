// @vitest-environment happy-dom
import type { Website } from "@reactive-resume/schema/resume/data";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { URLInput } from "./url-input";

it("shows a non-duplicated URL example in an LTR field", () => {
	i18n.loadAndActivate({ locale: "ar-SA", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<URLInput<Website> value={{ url: "https://example.org", label: "" }} onChange={vi.fn()} />
		</I18nProvider>,
	);
	const input = screen.getByRole("textbox");
	expect(input).toHaveAttribute("placeholder", "example.com");
	expect(input).toHaveAttribute("dir", "ltr");
	expect(input).toHaveClass("text-start");
});
