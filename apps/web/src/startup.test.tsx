// @vitest-environment happy-dom
import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { startApplication } from "./startup";
const mocks = vi.hoisted(() => ({ router: vi.fn() }));
vi.mock("./router", () => ({ getRouter: mocks.router }));
vi.mock("./libs/locale", () => ({ getLocale: () => "en-US", loadUiLocale: async () => {} }));
vi.mock("@tanstack/react-router", () => ({ RouterProvider: () => <p>Workspace ready</p>, useRouter: () => undefined }));
beforeEach(() => {
	document.body.innerHTML = '<div id="app"><p>Initial loading</p></div>';
	vi.clearAllMocks();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});
it("replaces a failed session boot with an error and retries initialization", async () => {
	mocks.router.mockRejectedValueOnce(new Error("session unavailable"));
	mocks.router.mockResolvedValueOnce({ load: vi.fn() });
	await act(async () => {
		await startApplication(document.getElementById("app") as HTMLElement);
	});
	expect(screen.getByRole("alert")).toHaveClass("bg-danger-soft");
	expect(screen.queryByText("Workspace ready")).toBeNull();
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	});
	expect(await screen.findByText("Workspace ready")).toBeInTheDocument();
	expect(mocks.router).toHaveBeenCalledTimes(2);
});
it("also recovers a failed initial route load", async () => {
	mocks.router.mockResolvedValueOnce({ load: vi.fn().mockRejectedValue(new Error("load failed")) });
	await act(async () => {
		await startApplication(document.getElementById("app") as HTMLElement);
	});
	expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
});

it("preserves the server noindex marker for a configured root-resume shell", async () => {
	document.head.innerHTML = '<meta name="robots" content="noindex, follow" data-root-resume-shell>';
	mocks.router.mockResolvedValueOnce({ load: vi.fn() });
	await act(async () => {
		await startApplication(document.getElementById("app") as HTMLElement);
	});
	expect(document.head.querySelector("meta[data-root-resume-shell]")).toHaveAttribute("content", "noindex, follow");
});
