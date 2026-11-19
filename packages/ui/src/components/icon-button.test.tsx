import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";
import { IconButton } from "./icon-button";
import { UiLabelsProvider } from "./ui-labels";

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
