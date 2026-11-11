// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { LoadingScreen } from "./loading-screen";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }));

afterEach(() => vi.unstubAllGlobals());

it("announces loading and animates the brand instead of a spinner", () => {
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		queueMicrotask(() => callback(0));
		return 1;
	});
	const { container } = render(<LoadingScreen />);
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
});

it.each([false, true])("respects reduced motion (%s) on the loading mark", async (reduced) => {
	vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
	const { container } = render(<LoadingScreen />);
	await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	expect(container.querySelector('[data-slot="brand-mark"]')).toHaveAttribute("data-playing", String(!reduced));
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
});
