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
it("owns a touch size without changing compact toolbar sizing", () => {
	const { container } = render(
		<Tabs defaultValue="one">
			<TabsList size="touch">
				<TabsTrigger value="one">First</TabsTrigger>
			</TabsList>
		</Tabs>,
	);
	expect(container.querySelector('[data-slot="tabs-list"]')).toHaveAttribute("data-size", "touch");
	expect(container.querySelector('[data-slot="tabs-trigger"]')?.className).toContain(
		"group-data-[size=touch]/tabs-list:min-h-11",
	);
});
