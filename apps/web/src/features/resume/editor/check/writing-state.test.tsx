import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WritingTab } from "./writing-tab";

const summary = vi.hoisted(() => ({ state: "off", pendingCount: null }));
vi.mock("../proposals/review-panel", () => ({
	useResumeReviewSummary: () => summary,
	ResumeReviewWorkspace: () => <p>Review controls</p>,
}));
afterEach(cleanup);
it("shows a clear disabled state without offering unavailable review controls", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<WritingTab />
		</I18nProvider>,
	);
	expect(screen.getByRole("heading", { name: "The assistant is not enabled yet" })).toBeVisible();
	expect(screen.getByText(/Nothing was sent to any provider/)).toBeVisible();
	expect(screen.queryByText("Review controls")).toBeNull();
});
