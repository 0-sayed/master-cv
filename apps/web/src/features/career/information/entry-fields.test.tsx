// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useState } from "react";
import { LanguageField, ProficiencyField } from "./entry-fields";

beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));
afterEach(cleanup);

it("preserves imported custom proficiency and exposes its editable text", () => {
	const change = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<ProficiencyField kind="language" label="Fluency" value="IELTS 7.5" onChange={change} />
		</I18nProvider>,
	);
	expect(screen.getByRole("textbox", { name: "Custom level" })).toHaveProperty("value", "IELTS 7.5");
	fireEvent.change(screen.getByRole("textbox", { name: "Custom level" }), { target: { value: "IELTS 8" } });
	expect(change).toHaveBeenCalledWith("IELTS 8", 0);
});
it("selects a preset and updates its numeric rating atomically", async () => {
	const change = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<ProficiencyField kind="skill" label="Proficiency" value="" onChange={change} />
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("combobox"));
	await waitFor(() => expect(screen.getByRole("option", { name: "Expert" })).toBeTruthy());
	fireEvent.click(screen.getByRole("option", { name: "Expert" }));
	expect(change).toHaveBeenCalledWith("Expert", 5);
});
it("reveals custom text only when Other is selected", async () => {
	function Field() {
		const [value, setValue] = useState("Elementary");
		return <ProficiencyField kind="language" label="Fluency" value={value} onChange={setValue} />;
	}
	render(
		<I18nProvider i18n={i18n}>
			<Field />
		</I18nProvider>,
	);
	expect(screen.queryByRole("textbox", { name: "Custom level" })).toBeNull();
	fireEvent.click(screen.getByRole("combobox"));
	await waitFor(() => expect(screen.getByRole("option", { name: "Other" })).toBeTruthy());
	fireEvent.click(screen.getByRole("option", { name: "Other" }));
	expect(screen.getByRole("textbox", { name: "Custom level" })).toHaveProperty("value", "");
});
it("allows an unlisted language without selecting or translating it", () => {
	const change = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<LanguageField label="Language" value="Klingon" onChange={change} />
		</I18nProvider>,
	);
	const input = screen.getByRole("combobox", { name: "Language" });
	expect(input).toHaveProperty("value", "Klingon");
	fireEvent.change(input, { target: { value: "Sindarin" } });
	expect(change).toHaveBeenCalledWith("Sindarin", 0);
});
