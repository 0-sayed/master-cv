import { cleanup, render, screen } from "@testing-library/react";
// @vitest-environment happy-dom
import { afterEach, expect, it } from "vite-plus/test";
import { setupI18n, type Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { FeatureBetaBadge } from "./feature-beta-badge";

afterEach(cleanup);
it.each([
	["ar-SA", "تجريبي"],
	["en-US", "Beta"],
] as const)("renders the shared Beta badge in %s", async (locale, text) => {
	const catalogs = import.meta.glob<{ messages: Messages }>("../../locales/*.po");
	const load = catalogs[`../../locales/${locale}.po`];
	if (!load) throw new Error(`Missing ${locale} catalog`);
	const { messages } = await load();
	const i18n = setupI18n({ locale, messages: { [locale]: messages } });
	render(
		<I18nProvider i18n={i18n}>
			<FeatureBetaBadge />
		</I18nProvider>,
	);
	expect(screen.getByText(text).getAttribute("data-slot")).toBe("badge");
});
