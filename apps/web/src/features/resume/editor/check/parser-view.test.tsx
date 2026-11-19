// @vitest-environment happy-dom
import { act, render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditorStore } from "../store";
import { ParserView } from "./parser-view";

const mocks = vi.hoisted(() => ({ resumeId: "A", extract: vi.fn(async (file: File) => file.text()) }));
afterEach(() => {
	cleanup();
	useEditorStore.getState().reset();
});
vi.mock("@/features/resume/builder/draft", () => ({
	useCurrentBuilderResumeSelector: (select: (resume: { id: string }) => unknown) => select({ id: mocks.resumeId }),
}));
vi.mock("./use-check", () => ({ useCheck: () => null }));
vi.mock("@/features/ats-checker/extract-client", () => ({ extractPdf: mocks.extract }));
vi.mock("@reactive-resume/resume/ats-pdf", () => ({
	buildExtractedDocument: (text: string) => ({ pages: [], lines: [{ text }], charCount: text.length }),
	buildResumeSemantics: () => ({
		contact: { nameLine: "", locationLine: "", emails: [], phones: [], textUrls: [], annotationUrls: [] },
		dates: [],
		headings: [],
	}),
}));

it("extracts each document and each reopened render independently", async () => {
	i18n.load("en", {});
	i18n.activate("en");
	const client = new QueryClient();
	const open = (id: string, text: string) => {
		mocks.resumeId = id;
		useEditorStore.getState().reset();
		const identity = { ownerId: "owner", resumeId: id, baseRevision: "1", editGeneration: 0 };
		useEditorStore.getState().setIdentity(identity);
		useEditorStore.getState().setRendered({ identity, pageCount: 1, pageMap: undefined, file: new Blob([text]) });
	};
	const ui = (
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<ParserView />
			</I18nProvider>
		</QueryClientProvider>
	);
	open("A", "Resume Alpha");
	const view = render(ui);
	await screen.findByText("Resume Alpha");
	expect(screen.queryByRole("group", { name: "Page view" })).toBeNull();
	expect(screen.queryByRole("radiogroup", { name: "Page view" })).toBeNull();
	view.unmount();
	open("B", "Resume Beta");
	const second = render(ui);
	await screen.findByText("Resume Beta");
	expect(screen.queryByText("Resume Alpha")).toBeNull();
	second.unmount();
	open("A", "Changed Alpha");
	render(ui);
	await screen.findByText("Changed Alpha");
	expect(mocks.extract).toHaveBeenCalledTimes(3);
	await act(async () => {
		client.clear();
	});
});

it("retries extraction failure and preserves actual text when a PDF finding is selected", async () => {
	i18n.load("en", {});
	i18n.activate("en");
	mocks.resumeId = "A";
	const identity = { ownerId: "owner", resumeId: "A", baseRevision: "1", editGeneration: 0 };
	useEditorStore.getState().setIdentity(identity);
	useEditorStore
		.getState()
		.setRendered({ identity, pageCount: 1, pageMap: undefined, file: new Blob(["Actual saved passage"]) });
	mocks.extract.mockRejectedValueOnce(new Error("read failed"));
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<ParserView />
			</I18nProvider>
		</QueryClientProvider>,
	);
	await screen.findByText("The PDF could not be read");
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await screen.findByText("Actual saved passage");
	act(() => useEditorStore.getState().setCheckIssue("pdf:NO_EMAIL:1:"));
	expect(screen.getByText("Actual saved passage")).toHaveAttribute("dir", "auto");
	act(() => useEditorStore.getState().setIdentity({ ...identity, editGeneration: 1 }));
	expect(screen.queryByText("Actual saved passage")).not.toBeInTheDocument();
	client.clear();
});
