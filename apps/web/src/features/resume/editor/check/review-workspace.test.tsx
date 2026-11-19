// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEffect } from "react";
import { useEditorStore } from "../store";
import { ReviewWorkspace } from "./review-workspace";

vi.mock("./check-panel", () => ({ CheckPanel: () => <section aria-label="Review findings">Full findings</section> }));
beforeEach(() => {
	useEditorStore.getState().reset();
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);
const wrap = (children: ReactNode) => <I18nProvider i18n={i18n}>{children}</I18nProvider>;
it("uses the normal editor panel and one mounted preview", () => {
	const { container } = render(wrap(<ReviewWorkspace preview={<p>CV preview</p>} />));
	expect(container.firstChild).toHaveClass("editor-standard-layout");
	expect(container.firstChild).not.toHaveClass("editor-review-layout");
	expect(screen.getAllByRole("main")).toHaveLength(1);
	expect(screen.getByRole("region", { name: "Review findings" })).toBeVisible();
	expect(screen.getByRole("region", { name: "Review findings" }).parentElement).toHaveClass("editor-panel-container");
});
it("keeps the preview mounted when switching between Review and other modes", () => {
	const mount = vi.fn();
	const unmount = vi.fn();
	function Preview() {
		useEffect(() => {
			mount();
			return unmount;
		}, []);
		return <p>One preview</p>;
	}
	const view = render(wrap(<ReviewWorkspace expanded={false} panel={<p>Write panel</p>} preview={<Preview />} />));
	view.rerender(wrap(<ReviewWorkspace expanded panel={<p>Write panel</p>} preview={<Preview />} />));
	view.rerender(wrap(<ReviewWorkspace expanded={false} panel={<p>Write panel</p>} preview={<Preview />} />));
	expect(mount).toHaveBeenCalledOnce();
	expect(unmount).not.toHaveBeenCalled();
});

it("keeps the full-screen phone findings above the hidden preview", () => {
	const view = render(wrap(<ReviewWorkspace phone pageVisible={false} preview={<p>One CV</p>} />));
	expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
	expect(screen.getByRole("region", { name: "Review findings" })).toBeVisible();
	view.rerender(wrap(<ReviewWorkspace phone pageVisible preview={<p>One CV</p>} />));
	expect(screen.getByRole("main")).not.toHaveAttribute("inert");
});
