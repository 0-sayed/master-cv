// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useEditorStore } from "../store";
import { useCheckPanelScroll } from "./panel-scroll";
import { REVIEW_HIGHLIGHT_MS } from "@/libs/motion";

function Panel({ active, finding = true }: { active: boolean; finding?: boolean }) {
	const { ref, onScroll } = useCheckPanelScroll(active);
	return (
		<div ref={ref} onScroll={onScroll} data-testid="panel">
			{finding && <div data-issue-card="lower">Lower finding</div>}
		</div>
	);
}
beforeEach(() => {
	useEditorStore.getState().reset();
	vi.useFakeTimers();
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
it("remounts at the saved position and focuses the originating finding with temporary feedback", () => {
	const first = render(<Panel active />);
	const panel = first.getByTestId("panel");
	panel.scrollTop = 930;
	fireEvent.scroll(panel);
	expect(useEditorStore.getState().checkScrollTop).toBe(930);
	first.unmount();
	useEditorStore.getState().setCheckReturnIssue("lower");
	const second = render(<Panel active />);
	const card = second.getByText("Lower finding");
	expect(second.getByTestId("panel").scrollTop).toBe(930);
	expect(card).toHaveFocus();
	expect(card).toHaveAttribute("data-check-return", "true");
	act(() => vi.advanceTimersByTime(REVIEW_HIGHLIGHT_MS));
	expect(card).not.toHaveAttribute("data-check-return");
});
it("restores on reopening a mounted drawer and waits for a late finding", async () => {
	useEditorStore.getState().setCheckScrollTop(840);
	useEditorStore.getState().setCheckReturnIssue("lower");
	const view = render(<Panel active={false} finding={false} />);
	view.rerender(<Panel active finding={false} />);
	view.rerender(<Panel active />);
	await act(async () => {});
	expect(view.getByText("Lower finding")).toHaveFocus();
	expect(view.getByTestId("panel").scrollTop).toBe(840);
});
