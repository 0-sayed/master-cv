// @vitest-environment happy-dom
import { render, fireEvent, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, expect, it } from "vite-plus/test";
import { useExportHistoryScroll } from "./export-history-scroll";
import { useEditorStore } from "./store";
beforeEach(() => {
	useEditorStore.getState().reset();
	useEditorStore
		.getState()
		.setIdentity({ ownerId: "alice", resumeId: "resume", baseRevision: "v1", editGeneration: 1 });
	useEditorStore.getState().setShareTab("history");
});
afterEach(cleanup);
function Body() {
	const scroll = useExportHistoryScroll("history");
	return (
		<div data-testid="body" {...scroll}>
			Versions
		</div>
	);
}
it("restores the same scroll offset after the modal unmounts for preview", () => {
	const first = render(<Body />);
	const body = first.getByTestId("body");
	body.scrollTop = 420;
	fireEvent.scroll(body);
	first.unmount();
	const second = render(<Body />);
	expect(second.getByTestId("body").scrollTop).toBe(420);
	expect(useEditorStore.getState().exportHistorySession?.scrollTop.history).toBe(420);
});
