import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vite-plus/test";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
it("offers raised page segments with count descriptions and keyboard panel selection", async () => {
	render(
		<Tabs defaultValue="ats">
			<TabsList size="page" aria-label="Guide">
				<TabsTrigger value="ats">ATS check</TabsTrigger>
				<TabsTrigger value="ai">AI</TabsTrigger>
			</TabsList>
			<TabsContent value="ats">PDF rules</TabsContent>
			<TabsContent value="ai">AI tools</TabsContent>
		</Tabs>,
	);
	expect(screen.getByRole("tablist")).toHaveAttribute("data-variant", "default");
	expect(screen.getByRole("tablist")).toHaveAttribute("data-size", "page");
	await userEvent.click(screen.getByRole("tab", { name: "ATS check" }));
	await userEvent.keyboard("{End}{Enter}");
	expect(screen.getByRole("tab", { name: "AI" })).toHaveFocus();
	expect(screen.getByRole("tabpanel")).toHaveTextContent("AI tools");
});
it("keeps full labels and keyboard navigation in a wrapping list", async () => {
	render(
		<Tabs defaultValue="ats">
			<TabsList layout="wrap" aria-label="Review">
				<TabsTrigger value="ats">ATS check</TabsTrigger>
				<TabsTrigger value="writing">Writing and content</TabsTrigger>
				<TabsTrigger value="ai">AI suggestions</TabsTrigger>
			</TabsList>
		</Tabs>,
	);
	expect(screen.getByRole("tablist", { name: "Review" })).toHaveAttribute("data-layout", "wrap");
	await userEvent.click(screen.getByRole("tab", { name: "ATS check" }));
	await userEvent.keyboard("{ArrowRight}");
	expect(screen.getByRole("tab", { name: "Writing and content" })).toHaveFocus();
	expect(screen.getByRole("tab", { name: "AI suggestions" })).toBeVisible();
});
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

it("offers equal panel tabs with complete labels and icons", () => {
	render(
		<Tabs defaultValue="history">
			<TabsList variant="line" size="panel" layout="equal" aria-label="Export sections">
				<TabsTrigger value="download">
					<svg aria-hidden="true" />
					Download PDF
				</TabsTrigger>
				<TabsTrigger value="history">
					<svg aria-hidden="true" />
					Version history
				</TabsTrigger>
			</TabsList>
		</Tabs>,
	);
	expect(screen.getByRole("tablist", { name: "Export sections" })).toHaveClass("w-full");
	expect(screen.getByRole("tablist", { name: "Export sections" })).toHaveAttribute("data-size", "panel");
	expect(screen.getByRole("tab", { name: "Version history" })).toHaveAttribute("aria-selected", "true");
	expect(screen.getByRole("tab", { name: "Download PDF" })).toHaveClass("group-data-[layout=equal]/tabs-list:flex-1");
});
