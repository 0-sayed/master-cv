import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Button } from "@reactive-resume/ui/components/button";
import { FindingCard } from "./check-sections";

afterEach(cleanup);
it.each(["blocker", "warning", "tip"] as const)(
	"keeps %s findings flat with a badge and visible actions",
	(severity) => {
		i18n.load("en", {});
		i18n.activate("en");
		const { container } = render(
			<I18nProvider i18n={i18n}>
				<FindingCard
					severity={severity}
					title="Add clear dates"
					why="Dates show when you worked."
					location="Page 1 · Experience"
					snippet="Worked here"
				>
					<Button variant="primary">Review</Button>
					<Button variant="secondary">Keep as is</Button>
				</FindingCard>
			</I18nProvider>,
		);
		expect(container.querySelector('[data-slot="alert"]')).toBeNull();
		expect(container.querySelectorAll('[data-slot="section-card"]')).toHaveLength(1);
		const badge = container.querySelector('[data-slot="badge"]');
		expect(badge).toHaveAttribute(
			"data-variant",
			severity === "blocker" ? "danger" : severity === "warning" ? "warn" : "info",
		);
		expect(screen.getByRole("heading", { name: "Add clear dates" })).toHaveClass("type-label");
		expect(screen.getByText("Page 1 · Experience")).toHaveClass("type-meta");
		expect(screen.getByText("Worked here")).toHaveAttribute("dir", "auto");
		expect(screen.getByRole("button", { name: "Keep as is" }).parentElement).toHaveAttribute(
			"data-slot",
			"action-group",
		);
	},
);
