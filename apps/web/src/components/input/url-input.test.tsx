// @vitest-environment happy-dom
import type { Website } from "@reactive-resume/schema/resume/data";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { URLInput } from "./url-input";

afterEach(cleanup);

const renderInput = (url: string, onChange = vi.fn()) => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<URLInput<Website> value={{ url, label: "Portfolio" }} onChange={onChange} />
		</I18nProvider>,
	);
	return { input: screen.getByRole("textbox"), onChange };
};

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

it.each([
	["adds the default HTTPS prefix", "", "example.org/path", "https://example.org/path"],
	["preserves an existing HTTP prefix", "http://old.example", "new.example/path", "http://new.example/path"],
	["preserves an explicit HTTPS prefix", "http://old.example", "https://new.example", "https://new.example"],
])("%s while editing", (_name, initial, edited, expected) => {
	const { input, onChange } = renderInput(initial);
	fireEvent.change(input, { target: { value: edited } });
	expect(onChange).toHaveBeenCalledWith({ url: expected, label: "Portfolio" });
});

it("clears the URL instead of restoring its prefix", () => {
	const { input, onChange } = renderInput("https://example.org");
	fireEvent.change(input, { target: { value: "" } });
	expect(onChange).toHaveBeenCalledWith({ url: "", label: "Portfolio" });
});
