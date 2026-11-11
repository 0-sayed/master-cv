// @vitest-environment happy-dom
import type { ResumeData } from "@reactive-resume/schema/resume/data";
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, assert, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumePreviewClient } from "./preview.browser";

vi.mock("motion/react", () => ({
	AnimatePresence: ({ children }: { children: ReactNode }) => children,
	m: { div: ({ children }: { children: ReactNode }) => <div>{children}</div> },
	useReducedMotion: () => true,
}));
vi.mock("../builder/draft", () => ({
	useResumeData: () => undefined,
	usePreviewPausedStore: (select: (state: { paused: boolean }) => unknown) => select({ paused: false }),
	isEditableElementFocused: () => false,
}));
vi.mock("@reactive-resume/ui/components/skeleton", () => ({ useSkeletonLoading: () => ({ pending: false }) }));
vi.mock("./preview.shared", () => ({ ResumePreviewLoader: () => null }));
vi.mock("./resume-accessible-text", () => ({ ResumeAccessibleText: () => null }));
vi.mock("./pdf-canvas", () => ({
	PdfCanvasDocument: ({
		children,
		onLoadSuccess,
	}: {
		children: (document: object) => ReactNode;
		onLoadSuccess: (document: { numPages: number }) => void;
	}) => (
		<div>
			<button onClick={() => onLoadSuccess({ numPages: 1 })}>Load document</button>
			{children({})}
		</div>
	),
	PdfCanvasPage: ({ onRenderSuccess }: { onRenderSuccess: () => void }) => (
		<button onClick={onRenderSuccess}>Paint page</button>
	),
}));
vi.mock("@/features/resume/export/pdf-artifact", () => ({ getPdfArtifact: vi.fn() }));
vi.mock("@/features/resume/export/pdf-document", () => ({
	createResumePdfBlob: async (data: ResumeData) => new Blob([data.basics.name]),
}));
vi.mock("@/libs/error-message", () => ({ getLostCharactersMessage: vi.fn(), getReadableErrorMessage: vi.fn() }));

afterEach(() => vi.useRealTimers());

it("publishes only the requested painted snapshot when leaving a temporary preview", async () => {
	vi.useFakeTimers();
	const temporary = structuredClone(defaultResumeData);
	temporary.basics.name = "Temporary preview";
	const current = structuredClone(defaultResumeData);
	current.basics.name = "Current document";
	const props = { pageLayout: "vertical" as const, pageScale: 1, showPageNumbers: false };
	const view = render(<ResumePreviewClient {...props} data={temporary} />);
	await act(async () => {
		await vi.runOnlyPendingTimersAsync();
	});
	fireEvent.click(screen.getByText("Load document"));
	fireEvent.click(screen.getByText("Paint page"));
	const onRender = vi.fn();
	view.rerender(<ResumePreviewClient {...props} data={current} onRender={onRender} />);
	expect(onRender).not.toHaveBeenCalled();
	await act(async () => {
		await vi.runOnlyPendingTimersAsync();
	});
	const document = screen.getAllByText("Load document").at(-1);
	assert(document);
	fireEvent.click(document);
	expect(onRender).not.toHaveBeenCalled();
	const page = screen.getAllByText("Paint page").at(-1);
	assert(page);
	fireEvent.click(page);
	expect(onRender).toHaveBeenCalledOnce();
	expect(await onRender.mock.calls[0]?.[0].file.text()).toBe("Current document");
});
