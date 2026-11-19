// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { InsightBar, InsightDataTable } from "./insight-chart";
afterEach(cleanup);
i18n.loadAndActivate({ locale: "en-US", messages: {} });
it("shows complete labels, counts, exact fractions and true zero bars", async () => {
	const label = "إحالة من زميل سابق في فريق العمل · Referral";
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<ul>
				<InsightBar label={label} count={0} denominator={20} maximum={7} />
			</ul>
			<InsightDataTable caption="Sources" rows={[{ label, count: 0, denominator: 20 }]} />
		</I18nProvider>,
	);
	expect(screen.getAllByText(label)[0]).toHaveAttribute("dir", "auto");
	expect(screen.getByText("0 / 20")).toBeVisible();
	expect(container.querySelector('[data-slot="insight-bar-fill"]')).toHaveStyle({ width: "0%" });
	await userEvent.tab();
	expect(screen.getByRole("button")).toHaveFocus();
	expect(await screen.findByRole("tooltip")).toHaveTextContent(label);
	await userEvent.keyboard("{Escape}");
});
