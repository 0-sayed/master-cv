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
	expect(useEditorStore.getState().reviewScrollTop.ats).toBe(930);
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
	useEditorStore.getState().setReviewScrollTop("ats", 840);
	useEditorStore.getState().setCheckReturnIssue("lower");
	const view = render(<Panel active={false} finding={false} />);
	view.rerender(<Panel active finding={false} />);
	view.rerender(<Panel active />);
	await act(async () => {});
	expect(view.getByText("Lower finding")).toHaveFocus();
	expect(view.getByTestId("panel").scrollTop).toBe(840);
});

it("restores separate tab positions without changing the selected filter", () => {
	const editor = useEditorStore.getState();
	editor.setReviewScrollTop("ats", 100);
	editor.setReviewScrollTop("writing", 500);
	editor.setReviewFilter("writing", "warning");
	const view = render(<Panel active />);
	expect(view.getByTestId("panel").scrollTop).toBe(100);
	act(() => editor.setReviewTab("writing"));
	expect(view.getByTestId("panel").scrollTop).toBe(500);
	expect(useEditorStore.getState().reviewFilters.writing).toBe("warning");
});

it("restores focus when a reopening panel accepts focus after multiple frames", () => {
	useEditorStore.getState().setCheckReturnIssue("lower");
	const focus = HTMLElement.prototype.focus;
	let attempts = 0;
	const delayed = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
		if (++attempts >= 3) focus.call(this, options);
	});
	const view = render(<Panel active />);
	const card = view.getByText("Lower finding");
	expect(card).not.toHaveFocus();
	act(() => vi.advanceTimersByTime(50));
	expect(card).toHaveFocus();
	delayed.mockRestore();
});

it("stops pending focus restoration when the panel closes", () => {
	useEditorStore.getState().setCheckReturnIssue("lower");
	const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {});
	const view = render(<Panel active />);
	expect(focus).toHaveBeenCalledTimes(1);
	view.rerender(<Panel active={false} />);
	act(() => vi.advanceTimersByTime(100));
	expect(focus).toHaveBeenCalledTimes(1);
	focus.mockRestore();
});

it("returns to the next row when the original finding disappears", () => {
	useEditorStore.setState({ checkReturnIssue: "removed", checkReturnIndex: 1, checkReturnAction: "show" });
	function Rows() {
		const { ref, onScroll } = useCheckPanelScroll(true);
		return (
			<div ref={ref} onScroll={onScroll}>
				<div data-issue-card="first">
					<button data-review-action="show">First</button>
				</div>
				<div data-issue-card="next">
					<button data-review-action="show">Next</button>
				</div>
			</div>
		);
	}
	const view = render(<Rows />);
	expect(view.getByRole("button", { name: "Next" })).toHaveFocus();
	expect(useEditorStore.getState().checkReturnIssue).toBeNull();
});
it("uses the empty-list message when no finding remains", () => {
	useEditorStore.setState({ checkReturnIssue: "removed" });
	function Empty() {
		const { ref } = useCheckPanelScroll(true);
		return (
			<div ref={ref}>
				<p data-review-empty tabIndex={-1}>
					No findings remain
				</p>
			</div>
		);
	}
	const view = render(<Empty />);
	expect(view.getByText("No findings remain")).toHaveFocus();
});
