// @vitest-environment happy-dom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEditorStore } from "../store";
import { CheckPanel } from "./check-panel";

const documentState = vi.hoisted(() => ({ locale: "en-US", pdfState: "not-checked", findings: false }));

vi.mock("@/features/resume/builder/draft", async () => {
	const { defaultResumeData } = await import("@reactive-resume/schema/resume/default");
	return {
		useResumeData: () => ({
			...defaultResumeData,
			metadata: {
				...defaultResumeData.metadata,
				page: { ...defaultResumeData.metadata.page, locale: documentState.locale },
			},
		}),
		useIsResumeLocked: () => false,
		useResumeStore: { getState: () => ({ resume: null }) },
	};
});
vi.mock("./use-readiness", async () => {
	const { emptyReadiness } = await import("@reactive-resume/resume/ats");
	return {
		useReadiness: () => ({
			results: {
				pdf: { ...emptyReadiness("pdf"), state: documentState.pdfState },
				writing: emptyReadiness("writing"),
				job: emptyReadiness("job"),
			},
			pdfReport: documentState.findings
				? { findings: [{ code: "NO_TEXT_LAYER", severity: "blocker", evidence: { page: 1 } }], tips: [] }
				: null,
			requestRetry: vi.fn(),
			introduced: true,
			setIntroduced: vi.fn(),
		}),
	};
});
vi.mock("./actions", () => ({ useCheckActions: () => ({}), editWithUndo: vi.fn() }));
vi.mock("./writing-tab", () => ({ WritingTab: () => null }));

beforeEach(() => {
	useEditorStore.getState().reset();
	documentState.locale = "en-US";
	documentState.pdfState = "not-checked";
	documentState.findings = false;
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);

const panel = () =>
	render(
		<I18nProvider i18n={i18n}>
			<CheckPanel />
		</I18nProvider>,
	);

it("places the page-view switch beside the Check heading and toggles the shared canvas state", async () => {
	panel();
	const heading = screen.getByRole("heading", { name: "Review your CV" });
	const group = screen.getByRole("radiogroup", { name: "Page view" });
	expect(heading.parentElement).toContainElement(group);
	const person = within(group).getByRole("radio", { name: "What a person sees" });
	const parser = within(group).getByRole("radio", { name: "What a parser reads" });
	expect(person).toHaveAttribute("aria-checked", "true");
	await userEvent.click(parser);
	expect(useEditorStore.getState().pageView).toBe("parser");
	expect(parser).toHaveAttribute("aria-checked", "true");
	expect(person).toHaveAttribute("aria-checked", "false");
	await userEvent.click(person);
	expect(useEditorStore.getState().pageView).toBe("page");
});

it("supports keyboard selection with the existing accessible option names", async () => {
	panel();
	await userEvent.click(screen.getByRole("radio", { name: "What a person sees" }));
	await userEvent.keyboard("{ArrowRight}");
	expect(screen.getByRole("radio", { name: "What a parser reads" })).toHaveFocus();
	expect(useEditorStore.getState().pageView).toBe("parser");
	await userEvent.keyboard("{ArrowLeft}");
	expect(useEditorStore.getState().pageView).toBe("page");
});

it("preserves the selected view when mobile navigation unmounts and reopens the Check panel", async () => {
	useEditorStore.getState().setMobileView("check");
	const view = panel();
	await userEvent.click(screen.getByRole("radio", { name: "What a parser reads" }));
	expect(useEditorStore.getState().mobileView).toBe("check");
	view.unmount();
	act(() => useEditorStore.getState().setMobileView("page"));
	expect(useEditorStore.getState().pageView).toBe("parser");
	act(() => useEditorStore.getState().setMobileView("check"));
	panel();
	expect(screen.getByRole("radio", { name: "What a parser reads" })).toHaveAttribute("aria-checked", "true");
	await userEvent.click(screen.getByRole("radio", { name: "What a person sees" }));
	expect(useEditorStore.getState().pageView).toBe("page");
});

it.each(["failed", "partial"])("gives %s checks a titled recovery notice", (state) => {
	documentState.pdfState = state;
	panel();
	const notice = document.querySelector('[data-slot="alert"]') as HTMLElement;
	expect(notice).toHaveClass(state === "failed" ? "bg-danger-soft" : "bg-warn-soft");
	expect(notice.querySelector('[data-slot="alert-title"]')).toHaveTextContent(
		state === "failed" ? "Check failed" : "Partially checked",
	);
	expect(within(notice).getByRole("button", { name: "Check the PDF again" })).toBeEnabled();
});

it("reveals extracted text outside the tablet drawer", async () => {
	documentState.pdfState = "complete";
	documentState.findings = true;
	useEditorStore.getState().setDrawerOpen(true);
	panel();
	await userEvent.click(screen.getByRole("button", { name: "Review extracted text" }));
	expect(useEditorStore.getState().drawerOpen).toBe(false);
	expect(useEditorStore.getState().pageView).toBe("parser");
	expect(useEditorStore.getState().mobileView).toBe("page");
});
