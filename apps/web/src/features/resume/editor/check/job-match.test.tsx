// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { analyzeJobTerms, JOB_NORMALIZATION_VERSION, JOB_RUBRIC_VERSION } from "@reactive-resume/resume/ats";
import { useEditorStore } from "../store";
import { JobMatchTab } from "./job-match";

const state = vi.hoisted(() => ({ current: true, report: null as unknown }));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: React.ReactNode }) => <a href="/job">{children}</a>,
}));
vi.mock("./use-readiness", () => ({
	useReadiness: () => ({ jobReport: state.report, results: { job: { state: state.current ? "complete" : "stale" } } }),
}));
afterEach(() => {
	cleanup();
	useEditorStore.getState().reset();
});
it("keeps matched and unmatched selected-job evidence readable in the editor", () => {
	i18n.load("en", {});
	i18n.activate("en");
	useEditorStore.getState().setIdentity({ ownerId: "owner", resumeId: "cv", baseRevision: "v1", editGeneration: 0 });
	state.current = true;
	state.report = analyzeJobTerms({
		identity: {
			resumeId: "cv",
			resumeRevision: "v1",
			contentHash: "hash",
			jobId: "job",
			jobRevision: "1",
			normalizationVersion: JOB_NORMALIZATION_VERSION,
			rubricVersion: JOB_RUBRIC_VERSION,
		},
		jobText: "React and PostgreSQL",
		passages: [{ id: "summary", target: { sectionId: "summary", field: "content" }, text: "Built React services" }],
	});
	const view = render(
		<I18nProvider i18n={i18n}>
			<JobMatchTab />
		</I18nProvider>,
	);
	expect(screen.getByText(/1 of 2 selected terms/)).toBeVisible();
	expect(screen.getByText(/react · Found in CV/)).toBeVisible();
	expect(screen.getByText(/postgresql · Not found in CV/)).toBeVisible();
	expect(screen.getByRole("link", { name: "Show in CV", hidden: true })).toHaveTextContent("Show in CV");
	expect(screen.getByRole("link", { name: "Compare with a job" })).toBeVisible();
	state.current = false;
	view.rerender(
		<I18nProvider i18n={i18n}>
			<JobMatchTab />
		</I18nProvider>,
	);
	expect(screen.queryByText(/1 of 2 selected terms/)).not.toBeInTheDocument();
});
