// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

afterEach(cleanup);

it("exposes the shared popup as an accessible tooltip", () => {
	render(
		<Tooltip open>
			<TooltipTrigger>Documents</TooltipTrigger>
			<TooltipContent>CV and cover letter</TooltipContent>
		</Tooltip>,
	);
	expect(screen.getByRole("tooltip").textContent).toBe("CV and cover letter");
});

it("lets Escape reach the owning interaction after dismissing a tooltip", () => {
	const onOpenChange = vi.fn();
	render(
		<Tooltip open onOpenChange={onOpenChange}>
			<TooltipTrigger>Move application</TooltipTrigger>
			<TooltipContent>Move</TooltipContent>
		</Tooltip>,
	);
	fireEvent.keyDown(screen.getByRole("button", { name: "Move application" }), { key: "Escape" });
	expect(onOpenChange).toHaveBeenCalledWith(
		false,
		expect.objectContaining({ reason: "escape-key", isPropagationAllowed: true }),
	);
});
