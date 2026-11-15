// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { DataSection } from "./data";
vi.mock("@tanstack/react-router", () => ({
	Link: ({ to, children }: { to: string; children: import("react").ReactNode }) => <a href={to}>{children}</a>,
}));
afterEach(cleanup);
it.each([false, true])("legacy data entry navigates to a review page (%s)", (openDeletion) => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<DataSection openDeletion={openDeletion} />
		</I18nProvider>,
	);
	expect(screen.getByRole("link")).toHaveAttribute(
		"href",
		openDeletion ? "/dashboard/settings/delete-account" : "/dashboard/settings/privacy",
	);
	expect(screen.queryByRole("button")).toBeNull();
});
