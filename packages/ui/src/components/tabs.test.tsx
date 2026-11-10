import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
it("exposes vertical orientation and navigates with vertical arrow keys", async () => {
	render(
		<Tabs orientation="vertical" defaultValue="first">
			<TabsList>
				<TabsTrigger value="first">First</TabsTrigger>
				<TabsTrigger value="second">Second</TabsTrigger>
			</TabsList>
			<TabsContent value="first">First panel</TabsContent>
			<TabsContent value="second">Second panel</TabsContent>
		</Tabs>,
	);
	expect(screen.getByRole("tablist")).toHaveAttribute("aria-orientation", "vertical");
	await userEvent.click(screen.getByRole("tab", { name: "First" }));
	await userEvent.keyboard("{ArrowDown}");
	expect(screen.getByRole("tab", { name: "Second" })).toHaveFocus();
});
