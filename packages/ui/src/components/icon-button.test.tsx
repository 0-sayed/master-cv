import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";
import { Chip } from "./chip";
import { IconButton } from "./icon-button";
import { UiLabelsProvider } from "./ui-labels";

it("fits chip actions without clipping their larger touch target", () => {
	const view = render(
		<Chip>
			Attachment
			<IconButton size="icon-chip" variant="quiet" icon="x" label="Remove attachment" />
		</Chip>,
	);
	const action = screen.getByRole("button", { name: "Remove attachment" });
	expect(action).toHaveAttribute("data-size", "icon-chip");
	expect(action).toHaveClass("size-6", "pointer-coarse:size-11", "pointer-coarse:min-h-11");
	expect(action.closest('[data-slot="chip"]')).toHaveClass("min-h-7");
	expect(view.container.querySelector('[class*="overflow-hidden"]')).toBeNull();
});

it.each([
	{ moreActions: "More actions", icon: "dots-three" as const },
	{ moreActions: "المزيد من الإجراءات", icon: "dots-three" as const },
	{ moreActions: "المزيد من الإجراءات", icon: "dots-three-vertical" as const },
])("names and explains an overflow trigger as $moreActions ($icon)", async ({ moreActions, icon }) => {
	render(
		<UiLabelsProvider value={{ close: "Close", moreActions }}>
			<IconButton icon={icon} label="Document options" size="icon-lg" />
		</UiLabelsProvider>,
	);
	const button = screen.getByRole("button", { name: moreActions });
	expect(button).toHaveAttribute("data-variant", "ghost");
	expect(button).toHaveAttribute("data-size", "icon-sm");
	await userEvent.hover(button);
	expect(await screen.findByRole("tooltip")).toHaveTextContent(moreActions);
});
