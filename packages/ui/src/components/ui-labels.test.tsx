import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./sheet";
import { UiLabelsProvider } from "./ui-labels";
it.each(["dialog", "sheet"])("uses app close-label translation in a %s and preserves dismissal", async (kind) => {
	const close = vi.fn();
	const Root = kind === "dialog" ? Dialog : Sheet;
	const Content = kind === "dialog" ? DialogContent : SheetContent;
	const Title = kind === "dialog" ? DialogTitle : SheetTitle;
	const Description = kind === "dialog" ? DialogDescription : SheetDescription;
	render(
		<UiLabelsProvider value={{ close: "إغلاق" }}>
			<Root open onOpenChange={close}>
				<Content>
					<Title>بيانات</Title>
					<Description>معلومات</Description>
				</Content>
			</Root>
		</UiLabelsProvider>,
	);
	await userEvent.click(screen.getByRole("button", { name: "إغلاق" }));
	expect(close).toHaveBeenCalledWith(false, expect.anything());
});
