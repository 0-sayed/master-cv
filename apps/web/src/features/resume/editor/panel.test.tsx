// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
	EditorPanel,
	EditorPanelHeader,
	EditorPanelBody,
	EditorPanelFooter,
} from "@reactive-resume/ui/components/editor-panel";
afterEach(cleanup);
it("shares a named header, one scroll body, and a separate footer", async () => {
	const close = vi.fn();
	const { container } = render(
		<EditorPanel>
			<EditorPanelHeader title="Export and history" titleId="export-title" onClose={close} closeLabel="Close export" />
			<EditorPanelBody>Settings</EditorPanelBody>
			<EditorPanelFooter>Download</EditorPanelFooter>
		</EditorPanel>,
	);
	expect(screen.getByRole("heading", { name: "Export and history" })).toHaveAttribute("id", "export-title");
	expect(container.querySelectorAll('[data-slot="editor-panel-body"]')).toHaveLength(1);
	await userEvent.click(screen.getByRole("button", { name: "Close export" }));
	expect(close).toHaveBeenCalledOnce();
});
