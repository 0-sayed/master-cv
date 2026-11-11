// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi, beforeEach } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { DownloadTab, getExportFormats } from "./download-tab";
const mocks = vi.hoisted(() => ({ generate: vi.fn(), download: vi.fn(), toast: vi.fn(), saveStatus: "saved" }));
vi.mock("@/features/resume/builder/draft", () => ({
	useCurrentResume: () => ({ id: "resume" }),
	useResumeStore: Object.assign((select: (state: { saveStatus: string }) => unknown) => select(mocks), {
		getState: () => mocks,
	}),
}));
vi.mock("@/features/resume/editor/check/use-check", () => ({ useOpenIssueCount: () => 4 }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/features/applications/queries", () => ({ applicationsListQueryOptions: () => ({}) }));
vi.mock("@/features/letters/export", () => ({ createLetterFile: vi.fn(), letterFileName: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({ client: {} }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("@reactive-resume/utils/file", () => ({ downloadWithAnchor: mocks.download }));
vi.mock("@/features/resume/export/use-resume-export", () => ({
	createExportFile: mocks.generate,
	getDefaultFileName: () => "resume",
	sanitizeFileName: (v: string) => v,
}));
beforeEach(() => {
	vi.clearAllMocks();
	mocks.saveStatus = "saved";
	i18n.load("en", {});
	i18n.activate("en");
});
it("disables an already open export sheet when a save conflict arrives", () => {
	const view = render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
	mocks.saveStatus = "conflict";
	view.rerender(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	expect(mocks.generate).not.toHaveBeenCalled();
});
it("offers PDF and disabled Word only until A05", () => {
	expect(getExportFormats().map((v) => v.id)).toEqual(["pdf", "docx"]);
	expect(getExportFormats().find((v) => v.id === "docx")?.disabled).toBe(true);
});
it("keeps PDF available with findings, reports failure honestly, and retries the actual download", async () => {
	i18n.load("en", {});
	i18n.activate("en");
	mocks.generate.mockRejectedValueOnce(new Error("Export unavailable"));
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={() => {}} />
		</I18nProvider>,
	);
	expect(screen.getByRole("radio", { name: /Word/ })).toHaveAttribute("aria-disabled", "true");
	fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
	const failure = await screen.findByText(/file couldn.t be generated/);
	expect(failure.closest('[role="alert"]')).toHaveTextContent("Download failed.");
	expect(mocks.download).not.toHaveBeenCalled();
	const blob = new Blob(["synthetic-pdf"]);
	mocks.generate.mockResolvedValueOnce(blob);
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	await waitFor(() => expect(mocks.download).toHaveBeenCalledWith(blob, "resume.pdf"));
	expect(screen.queryByRole("link", { name: "Donate" })).toBeNull();
	expect(screen.queryByRole("link", { name: /Discord/ })).toBeNull();
});

it("uses a warning with a titled review action while keeping download available", () => {
	const onReview = vi.fn();
	render(
		<I18nProvider i18n={i18n}>
			<DownloadTab onReview={onReview} />
		</I18nProvider>,
	);
	expect(document.querySelector('[data-slot="alert"]')).toHaveClass("bg-warn-soft");
	expect(document.querySelector('[data-slot="alert"]')).toHaveTextContent("Review your CV");
	fireEvent.click(screen.getByRole("button", { name: "Review now" }));
	expect(onReview).toHaveBeenCalledOnce();
	expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
});
