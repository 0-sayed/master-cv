// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { DEFAULT_PDF_PAGE_SIZE } from "../../preview/preview.shared.utils";
import { useEditorStore } from "../store";
import { CheckPageLayer } from "./page-layer";

vi.mock("./use-check", () => ({
	useCheck: () => ({
		data: defaultResumeData,
		issues: [
			{
				key: "missing-email",
				number: 3,
				title: "Missing email",
				target: { kind: "header" },
			},
		],
	}),
}));
vi.mock("./actions", () => ({ scrollToIssue: vi.fn(), useCheckActions: () => ({}) }));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "desktop" }));

beforeEach(() => {
	useEditorStore.getState().reset();
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);

it("centres the issue number within the shared square badge without inherited padding or line height", () => {
	render(
		<I18nProvider i18n={i18n}>
			<CheckPageLayer
				pageIndex={0}
				pageMap={{
					pages: [DEFAULT_PDF_PAGE_SIZE],
					nodes: [
						{
							kind: "header",
							key: "header",
							page: 0,
							x: 40,
							y: 40,
							width: DEFAULT_PDF_PAGE_SIZE.width,
							height: DEFAULT_PDF_PAGE_SIZE.height / 10,
						},
					],
				}}
			/>
		</I18nProvider>,
	);
	const pin = screen.getByRole("button", { name: "Issue 3: Missing email" });
	expect(pin).toHaveTextContent("3");
	// These layout contracts prevent a locale's taller line box or native button padding shifting the digit.
	expect(pin).toHaveClass("grid", "size-6", "place-items-center", "p-0", "type-count", "tabular-nums");
	expect(pin).not.toHaveClass("type-metadata");
});
