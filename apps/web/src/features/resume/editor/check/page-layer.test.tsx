import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { useEditorStore } from "../store";
import { CheckPageLayer } from "./page-layer";
const fixture = vi.hoisted(() => ({ state: "complete", hash: "bytes" }));
const identity = { ownerId: "owner", resumeId: "cv", baseRevision: "1", editGeneration: 0 };
const map = {
	pages: [
		{ width: 300, height: 400 },
		{ width: 600, height: 800 },
	],
	nodes: [],
};
vi.mock("./use-check", () => ({ useCheck: () => ({ data: { metadata: { check: { ignored: [] } } }, issues: [] }) }));
vi.mock("./actions", () => ({ scrollToIssue: vi.fn() }));
vi.mock("./use-readiness", () => ({
	useReadiness: () => ({
		results: {
			pdf: {
				state: fixture.state,
				source: { ownerId: "owner", resumeId: "cv", baseRevision: "1", editGeneration: 0, bytesHash: fixture.hash },
			},
		},
		pdfReport: {
			findings: [
				{ code: "NO_EMAIL", severity: "warning", evidence: { page: 2, box: { x: 60, y: 80, width: 120, height: 40 } } },
				{ code: "NO_PHONE", severity: "warning", evidence: { page: 2 } },
				{ code: "UNTAGGED_PDF", severity: "warning" },
				{
					code: "LONG_BULLETS",
					severity: "tip",
					evidence: {
						locations: [
							{
								page: 2,
								box: { x: 60, y: 80, width: (map.pages[1]?.width ?? 0) / 5, height: (map.pages[1]?.height ?? 0) / 20 },
							},
							{
								page: 2,
								box: { x: 60, y: 140, width: (map.pages[1]?.width ?? 0) / 5, height: (map.pages[1]?.height ?? 0) / 20 },
							},
						],
					},
				},
			],
			tips: [],
		},
	}),
}));
beforeEach(() => {
	useEditorStore.getState().reset();
	fixture.state = "complete";
	fixture.hash = "bytes";
	useEditorStore.setState({
		identity,
		checkIssue: "pdf:NO_EMAIL:2:",
		rendered: { identity, bytesHash: "bytes", pageMap: map, pageCount: 2, version: 1, file: new Blob(["pdf"]) },
	});
	i18n.load("en", {});
	i18n.activate("en");
});
afterEach(cleanup);
const mount = (pageIndex = 1) =>
	render(
		<I18nProvider i18n={i18n}>
			<CheckPageLayer pageIndex={pageIndex} pageMap={map} />
		</I18nProvider>,
	);
it("draws only the selected box in the real second-page coordinate space", () => {
	const { container } = mount();
	const pin = container.querySelector("[data-issue-pin]");
	expect(container.querySelectorAll("[data-issue-pin]")).toHaveLength(1);
	expect(pin).toHaveStyle({ left: "10%", top: "10%", width: "20%", height: "5%" });
});
it.each(["stale", "failed", "checking"])("draws no obsolete pins while %s", (state) => {
	fixture.state = state;
	expect(mount().container).toBeEmptyDOMElement();
});
it("rejects stale coordinates and does not invent a page-sized box", () => {
	fixture.hash = "old";
	expect(mount().container).toBeEmptyDOMElement();
	cleanup();
	fixture.hash = "bytes";
	expect(mount(0).container).toBeEmptyDOMElement();
	cleanup();
	useEditorStore.getState().setCheckIssue("pdf:NO_PHONE:2:");
	expect(mount().container.querySelector('[data-issue-pin="pdf:NO_PHONE:2:"]')).toBeNull();
	cleanup();
	useEditorStore.setState({ identity: { ...identity, editGeneration: 1 } });
	expect(mount().container).toBeEmptyDOMElement();
});

it("shows no markers before selection", () => {
	useEditorStore.setState({ checkIssue: null });
	expect(mount().container.querySelectorAll("[data-issue-pin]")).toHaveLength(0);
});

it("keeps the preview empty before rendered PDF bytes are available", () => {
	useEditorStore.setState({ rendered: { identity, pageMap: map, pageCount: 2, version: 1, file: undefined } });
	expect(mount().container).toBeEmptyDOMElement();
});

it("shows every location and no document-wide box", () => {
	useEditorStore.getState().setCheckIssue("pdf:LONG_BULLETS:document:");
	const { container } = mount();
	expect(container.querySelectorAll('[data-issue-pin="pdf:LONG_BULLETS:document:"]')).toHaveLength(2);
	expect(container.querySelectorAll("[data-issue-pin] button")).toHaveLength(0);
	cleanup();
	useEditorStore.getState().setCheckIssue("pdf:UNTAGGED_PDF:document:");
	expect(mount().container.querySelectorAll("[data-issue-pin]")).toHaveLength(0);
});
