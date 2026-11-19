import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Sheet", () => {
	it("uses the shared editor width and full mobile viewport without changing default sheets", () => {
		render(
			<Sheet defaultOpen>
				<SheetContent size="editor" side="bottom">
					<SheetTitle>Review export</SheetTitle>
				</SheetContent>
			</Sheet>,
		);
		const dialog = screen.getByRole("dialog", { name: "Review export" });
		expect(dialog).toHaveAttribute("data-size", "editor");
		expect(dialog).toHaveClass("data-[side=bottom]:h-svh");
		expect(dialog).toHaveClass("data-[side=right]:sm:max-w-(--editor-panel)");
	});
	it.each(["top", "right", "bottom", "left"] as const)(
		"opens and closes a %s sheet without Base UI warnings",
		async (side) => {
			const error = vi.spyOn(console, "error").mockImplementation(() => {});
			const onOpenChange = vi.fn();
			render(
				<Sheet defaultOpen onOpenChange={onOpenChange}>
					<SheetContent side={side}>
						<SheetTitle>Share resume</SheetTitle>
						<SheetDescription>Choose how to share your resume.</SheetDescription>
					</SheetContent>
				</Sheet>,
			);

			expect(screen.getByRole("dialog", { name: "Share resume" })).toBeVisible();
			expect(error).not.toHaveBeenCalled();
			await userEvent.click(screen.getByRole("button", { name: "Close" }));
			expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
		},
	);
});

it("offers a labelled screen presentation without changing default sheet dimensions", () => {
	render(
		<Sheet defaultOpen>
			<SheetContent presentation="screen" side="bottom">
				<SheetTitle>Export panel</SheetTitle>
				<div data-slot="editor-panel-body">Body</div>
				<footer>Download</footer>
			</SheetContent>
		</Sheet>,
	);
	expect(screen.getByRole("dialog", { name: "Export panel" })).toHaveAttribute("data-presentation", "screen");
	expect(screen.getByRole("dialog", { name: "Export panel" })).toHaveClass("max-w-none");
});
