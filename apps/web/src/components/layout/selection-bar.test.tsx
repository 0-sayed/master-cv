// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { SelectionBar } from "./selection-bar";

afterEach(cleanup);

it("keeps selected actions outside scrolling containers and keyboard reachable", () => {
	const clear = vi.fn();
	const view = render(
		<SelectionBar label="Selected applications" count={1}>
			<button onClick={clear}>Clear selection</button>
		</SelectionBar>,
	);
	const bar = screen.getByRole("toolbar", { name: "Selected applications" });
	expect(view.container.contains(bar)).toBe(false);
	expect(bar.className).toContain("fixed");
	const button = screen.getByRole("button", { name: "Clear selection" });
	button.focus();
	expect(document.activeElement).toBe(button);
	fireEvent.click(button);
	expect(clear).toHaveBeenCalledOnce();
});

it("hides inactive actions from keyboard and screen readers", () => {
	render(
		<SelectionBar label="Selected documents" count={0}>
			<button>Delete</button>
		</SelectionBar>,
	);
	expect(screen.queryByRole("toolbar")).toBeNull();
	expect(document.querySelector("[inert]")).not.toBeNull();
});
