// @vitest-environment happy-dom

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { LoadingScreen } from "./loading-screen";

vi.mock("@tanstack/react-router", () => ({ useRouter: () => undefined }));

beforeEach(() => i18n.loadAndActivate({ locale: "en-US", messages: {} }));

afterEach(() => vi.unstubAllGlobals());

it("announces loading with the final brand instead of a spinner", () => {
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		queueMicrotask(() => callback(0));
		return 1;
	});
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<LoadingScreen />
		</I18nProvider>,
	);
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
	expect(container.querySelector('[data-slot="spinner"]')).toBeNull();
});

it.each([false, true])("keeps the React loading mark still after the HTML boot entrance (%s)", async (reduced) => {
	vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<LoadingScreen />
		</I18nProvider>,
	);
	await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
	expect(container.querySelector('[data-slot="brand-mark"]')).toHaveAttribute("data-playing", "false");
	expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
});
