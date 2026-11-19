// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { SeverityFilter } from "./severity-filter";
import { getUiLocaleMessages } from "@/libs/locale";

afterEach(cleanup);
it.each([
	[
		"all",
		"neutral",
		"data-checked:bg-sunken data-checked:text-ink data-checked:border-ink [&>[data-slot=icon]]:text-ink",
	],
	[
		"blocker",
		"danger",
		"data-checked:bg-danger-soft data-checked:text-danger-text data-checked:border-danger-text [&>[data-slot=icon]]:text-danger-text",
	],
	[
		"warning",
		"warn",
		"data-checked:bg-warn-soft data-checked:text-warn-text data-checked:border-warn-text [&>[data-slot=icon]]:text-warn-text",
	],
	[
		"tip",
		"info",
		"data-checked:bg-info-soft data-checked:text-info-text data-checked:border-info-text [&>[data-slot=icon]]:text-info-text",
	],
] as const)("uses the semantic %s selection and icon colors", async (value, tone, classes) => {
	i18n.loadAndActivate(await getUiLocaleMessages("en-US"));
	render(
		<I18nProvider i18n={i18n}>
			<SeverityFilter label="Severity" value={value} onChange={vi.fn()} counts={{ blocker: 1, warning: 2, tip: 3 }} />
		</I18nProvider>,
	);
	const selected = screen.getAllByRole("radio").find((choice) => choice.getAttribute("aria-checked") === "true");
	expect(selected).toHaveAttribute("data-tone", tone);
	expect(selected).toHaveClass(...classes.split(" "));
	expect(selected).not.toHaveClass("data-checked:bg-accent-soft");
	expect(selected).not.toHaveClass("hover:bg-hover");
});
it.each(["ar-SA", "en-US"] as const)(
	"shows only present severities with counts and supports keyboard selection in %s",
	async (locale) => {
		i18n.loadAndActivate(await getUiLocaleMessages(locale));
		const change = vi.fn();
		render(
			<I18nProvider i18n={i18n}>
				<SeverityFilter label="Severity" value="all" onChange={change} counts={{ blocker: 0, warning: 3, tip: 2 }} />
			</I18nProvider>,
		);
		const choices = screen.getAllByRole("radio");
		expect(choices).toHaveLength(3);
		expect(choices.map((item) => item.textContent?.trim())).toEqual(
			locale === "ar-SA" ? ["الكل 5", "تحذير 3", "نصيحة 2"] : ["All 5", "Warning 3", "Tip 2"],
		);
		choices[0]?.focus();
		await userEvent.keyboard("{ArrowRight}{Space}");
		expect(change).toHaveBeenCalledWith("warning");
		for (const choice of choices) expect(choice.querySelector('[data-slot="icon"]')).not.toBeNull();
	},
);
