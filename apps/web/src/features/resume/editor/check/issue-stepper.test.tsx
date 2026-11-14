// @vitest-environment happy-dom
import type { CheckIssue } from "./issues";
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { emptyReadiness } from "@reactive-resume/resume/ats";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { useEditorStore } from "../store";
import { CheckPanel } from "./check-panel";
import { IssueStepper } from "./page-layer";

const mocks = vi.hoisted(() => ({
	data: undefined as ResumeData | undefined,
	issue: undefined as CheckIssue | undefined,
	update: vi.fn(),
	setMode: vi.fn(),
}));

vi.mock("@/features/resume/builder/draft", () => ({
	useIsResumeLocked: () => false,
	useResumeStore: {
		getState: () => ({
			resume: { id: "cv", data: mocks.data },
			updateResumeData: mocks.update,
			ownerId: "owner",
			resumeId: "cv",
			editGeneration: 1,
			canUndo: false,
		}),
	},
}));
vi.mock("@reactive-resume/ui/hooks/use-breakpoint", () => ({ useBreakpoint: () => "mobile" }));
vi.mock("../use-editor-mode", () => ({ useEditorMode: () => ["check", mocks.setMode] }));
vi.mock("./use-check", () => ({
	useCheck: () => ({ report: { ignored: [] }, data: mocks.data, issues: mocks.issue ? [mocks.issue] : [] }),
}));
vi.mock("./use-readiness", () => ({
	useReadiness: () => ({
		results: { pdf: emptyReadiness("pdf"), writing: emptyReadiness("writing"), job: emptyReadiness("job") },
		pdfReport: null,
		requestRetry: vi.fn(),
		introduced: true,
		setIntroduced: vi.fn(),
	}),
}));
vi.mock("./writing-tab", () => ({ WritingTab: () => null }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));

/** Mirrors MobileBody: the Check panel is unmounted while Page and its issue stepper are visible. */
function MobileCheckHost() {
	const view = useEditorStore((state) => state.mobileView);
	if (view === "page") return <IssueStepper />;
	if (view === "check") return <CheckPanel />;
	return <p>Write fields</p>;
}

const mobile = () =>
	render(
		<I18nProvider i18n={i18n}>
			<MobileCheckHost />
		</I18nProvider>,
	);

beforeEach(() => {
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en", messages: {} });
	mocks.data = structuredClone(defaultResumeData);
	mocks.data.basics.website.url = "example.com";
	mocks.issue = {
		key: "website",
		number: 1,
		finding: { code: "MALFORMED_URL", severity: "warning", pointer: "/basics/website/url", key: "website" },
		category: "contact",
		title: "Website needs a protocol",
		body: "Review the website link before changing it.",
		fix: {
			kind: "apply",
			label: "Fix website",
			icon: "link",
			done: "Website updated",
			apply: (data) => {
				data.basics.website.url = "https://example.com";
			},
		},
		keepLabel: false,
		target: { kind: "header" },
	};
	mocks.update.mockImplementation((mutate: (data: ResumeData) => void) => {
		assert(mocks.data);
		mutate(mocks.data);
	});
	useEditorStore.getState().reset();
	useEditorStore.getState().setIdentity({ ownerId: "owner", resumeId: "cv", baseRevision: "v1", editGeneration: 1 });
	useEditorStore.getState().setMobileView("page");
	useEditorStore.getState().setCheckIssue("website");
});

it("opens mobile automatic-fix review before mutation, preserves rejected changes and applies acceptance once", async () => {
	const before = structuredClone(mocks.data);
	mobile();
	expect(screen.queryByRole("heading", { name: "Review your CV" })).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Fix website" }));
	const dialog = await screen.findByRole("dialog", { name: "Review this change" });
	expect(within(dialog).getByText("example.com")).toBeVisible();
	expect(within(dialog).getByText("https://example.com")).toBeVisible();
	expect(mocks.data).toEqual(before);
	expect(mocks.update).not.toHaveBeenCalled();
	await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(mocks.data).toEqual(before);
	expect(mocks.update).not.toHaveBeenCalled();
	act(() => useEditorStore.getState().setMobileView("page"));
	fireEvent.click(screen.getByRole("button", { name: "Fix website" }));
	const next = await screen.findByRole("dialog", { name: "Review this change" });
	await userEvent.click(within(next).getByRole("button", { name: "Accept change" }));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	assert(before);
	before.basics.website.url = "https://example.com";
	expect(mocks.data).toEqual(before);
	expect(mocks.update).toHaveBeenCalledOnce();
	expect(useEditorStore.getState().checkFixPreview).toBeNull();
});

it("keeps field-review issues on the mobile Write path", () => {
	assert(mocks.issue);
	mocks.issue.fix = { kind: "write", label: "Review website", target: { kind: "header" } };
	const before = structuredClone(mocks.data);
	mobile();
	fireEvent.click(screen.getByRole("button", { name: "Review website" }));
	expect(screen.getByText("Write fields")).toBeVisible();
	expect(mocks.setMode).toHaveBeenCalledWith("write");
	expect(useEditorStore.getState().mobileView).toBe("write");
	expect(useEditorStore.getState().selection).toEqual({ kind: "header" });
	expect(useEditorStore.getState().checkFixPreview).toBeNull();
	expect(mocks.data).toEqual(before);
	expect(mocks.update).not.toHaveBeenCalled();
});
