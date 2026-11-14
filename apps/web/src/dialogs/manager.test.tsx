import type { ReactNode } from "react";
// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { DialogContent, DialogTitle } from "@reactive-resume/ui/components/dialog";
import { useDialogStore } from "./store";

beforeEach(() => {
	vi.resetModules();
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	useDialogStore.setState({
		open: true,
		activeDialog: { type: "auth.change-password", data: undefined },
		openCount: 1,
	});
});
afterEach(() => {
	cleanup();
	vi.doUnmock("./renderers");
});

it("shows a labelled dismissible overlay while loading the first dialog", async () => {
	let finish!: (value: { renderDialog: () => ReactNode }) => void;
	vi.doMock(
		"./renderers",
		() =>
			new Promise<{ renderDialog: () => ReactNode }>((resolve) => {
				finish = resolve;
			}),
	);
	const { DialogManager } = await import("./manager");
	const { useDialogStore: freshStore } = await import("./store");
	freshStore.setState(useDialogStore.getState());
	render(
		<I18nProvider i18n={i18n}>
			<DialogManager />
		</I18nProvider>,
	);
	expect(screen.getByRole("status").getAttribute("aria-label")).toBe("Loading workspace…");
	expect(screen.getByRole("button", { name: "Close" })).toBeDefined();
	await waitFor(() => expect(finish).toBeTypeOf("function"));
	finish({
		renderDialog: () => (
			<DialogContent>
				<DialogTitle>Loaded form</DialogTitle>
			</DialogContent>
		),
	});
	await waitFor(() => expect(screen.getByRole("heading", { name: "Loaded form" })).toBeDefined());
	expect(screen.queryByRole("status")).toBeNull();
});

it("keeps a failed chunk in a dismissible overlay and retries loading it", async () => {
	vi.doMock("./renderers", () => {
		throw new Error("Chunk unavailable");
	});
	const { DialogManager } = await import("./manager");
	const { useDialogStore: freshStore } = await import("./store");
	freshStore.setState(useDialogStore.getState());
	render(
		<I18nProvider i18n={i18n}>
			<DialogManager />
		</I18nProvider>,
	);
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Something went wrongRetry"));
	vi.doMock("./renderers", () => ({
		renderDialog: () => (
			<DialogContent>
				<DialogTitle>Recovered form</DialogTitle>
			</DialogContent>
		),
	}));
	fireEvent.click(screen.getByRole("button", { name: "Retry" }));
	await waitFor(() => expect(screen.getByRole("heading", { name: "Recovered form" })).toBeDefined());
	expect(screen.queryByRole("alert")).toBeNull();
});
