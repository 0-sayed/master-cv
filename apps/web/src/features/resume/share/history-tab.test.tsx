// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEditorStore } from "../editor/store";
import { HistoryTab, HistoryTimeline, type HistorySource } from "./history-tab";

const mocks = vi.hoisted(() => ({
	save: vi.fn(),
	create: vi.fn(),
	restore: vi.fn(),
	replace: vi.fn(),
	toast: vi.fn(),
	confirm: vi.fn(),
}));
vi.mock("@/features/resume/builder/draft", () => ({
	savePendingChanges: mocks.save,
	useCurrentResume: () => ({ id: "resume", isLocked: false }),
	useResumeStore: {
		getState: () => ({
			replaceResumeFromServer: mocks.replace,
			restoreVersion: async () => {
				if (!(await mocks.save("resume"))) throw new Error("Couldn't save your changes. Try again before continuing.");
				return mocks.restore();
			},
		}),
	},
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => mocks.confirm, usePrompt: () => vi.fn() }));
vi.mock("@/libs/error-message", () => ({ getResumeErrorMessage: (error: Error) => error.message }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.toast } }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		resume: {
			listVersions: {
				queryKey: () => ["versions"],
				queryOptions: () => ({
					queryKey: ["versions"],
					queryFn: async () => [{ id: "version", kind: "named", name: "Checkpoint", createdAt: new Date() }],
				}),
			},
			getById: { queryKey: () => ["resume"] },
			createVersion: { call: mocks.create },
			restoreVersion: { call: mocks.restore },
		},
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	mocks.save.mockResolvedValue(false);
	mocks.confirm.mockResolvedValue(true);
	useEditorStore.getState().reset();
	i18n.load("en", {});
	i18n.activate("en");
});

it.each(["name", "restore"])("stops History %s after the save barrier fails", async (action) => {
	if (action === "restore") useEditorStore.getState().setHistoryVersion("version");
	const client = new QueryClient();
	render(
		<QueryClientProvider client={client}>
			<I18nProvider i18n={i18n}>
				<HistoryTab />
			</I18nProvider>
		</QueryClientProvider>,
	);
	if (action === "name") {
		fireEvent.change(screen.getByRole("textbox", { name: "Name this version" }), {
			target: { value: "Unsaved draft" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
	} else fireEvent.click(await screen.findByRole("button", { name: "Restore this version" }));
	await waitFor(() =>
		expect(mocks.toast).toHaveBeenCalledWith({
			type: "error",
			description: "Couldn't save your changes. Try again before continuing.",
		}),
	);
	expect(mocks.save).toHaveBeenCalledWith("resume");
	expect(mocks.create).not.toHaveBeenCalled();
	expect(mocks.restore).not.toHaveBeenCalled();
	expect(mocks.replace).not.toHaveBeenCalled();
	if (action === "name")
		expect((screen.getByRole("textbox", { name: "Name this version" }) as HTMLInputElement).value).toBe(
			"Unsaved draft",
		);
	else expect(useEditorStore.getState().historyVersionId).toBe("version");
	client.clear();
});

const source = (overrides: Partial<HistorySource> = {}): HistorySource => ({
	versions: undefined,
	loading: false,
	loadError: true,
	retrying: false,
	retry: vi.fn(),
	locked: false,
	nowDetail: "Current CV",
	save: vi.fn(),
	restore: vi.fn(),
	rename: vi.fn(),
	remove: vi.fn(),
	errorMessage: String,
	...overrides,
});

it("keeps locked history read-only and limits named-version input without menus on automatic versions", () => {
	const save = vi.fn();
	const restore = vi.fn();
	useEditorStore.getState().setHistoryVersion("named");
	render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline
				source={source({
					loadError: false,
					locked: true,
					save,
					restore,
					versions: [
						{ id: "named", kind: "named", name: "Mixed نسخة " + "x".repeat(60), createdAt: new Date() },
						{ id: "automatic", kind: "auto", name: null, createdAt: new Date() },
					],
				})}
			/>
		</I18nProvider>,
	);
	const input = screen.getByRole("textbox", { name: "Name this version" });
	expect(input).toHaveAttribute("maxlength", "80");
	fireEvent.change(input, { target: { value: "New named version" } });
	expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Restore this version" })).toBeDisabled();
	expect(screen.getAllByRole("button", { name: "More actions" })).toHaveLength(1);
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
	expect(save).not.toHaveBeenCalled();
	expect(restore).not.toHaveBeenCalled();
});

it("distinguishes failed history from a successful empty list and retries", () => {
	const retry = vi.fn();
	const view = render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline source={source({ retry })} />
		</I18nProvider>,
	);
	expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load version history");
	expect(screen.queryByRole("list", { name: "Versions" })).toBeNull();
	expect(screen.queryByText(/Only one version/)).toBeNull();
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(retry).toHaveBeenCalledOnce();
	view.rerender(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline source={source({ loadError: false, versions: [] })} />
		</I18nProvider>,
	);
	expect(screen.queryByRole("alert")).toBeNull();
	expect(screen.getByRole("list", { name: "Versions" })).toHaveTextContent("Current version");
});
it("keeps cached versions visible after a refresh failure and disables duplicate retries", () => {
	render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline
				source={source({
					retrying: true,
					versions: [{ id: "cached", kind: "named", name: "Cached checkpoint", createdAt: new Date() }],
				})}
			/>
		</I18nProvider>,
	);
	expect(screen.getByRole("alert")).toBeInTheDocument();
	expect(screen.getByRole("list", { name: "Versions" })).toHaveTextContent("Cached checkpoint");
	expect(screen.getByRole("button", { name: "Retrying…" })).toBeDisabled();
	expect(screen.queryByText(/Only one version/)).toBeNull();
});

it("disables navigation to Now and other versions while saving before a preview", async () => {
	let finish: () => void = () => {};
	const preparePreview = vi.fn(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	useEditorStore.getState().setHistoryVersion("first");
	render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline
				source={source({
					loadError: false,
					versions: [
						{ id: "first", kind: "named", name: "First", createdAt: new Date() },
						{ id: "second", kind: "named", name: "Second", createdAt: new Date() },
					],
					preparePreview,
				})}
			/>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^Second/ }));
	expect(screen.getByRole("button", { name: /^Current version/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Back to current" })).toBeDisabled();
	expect(screen.getByRole("button", { name: /^First/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: /^Second/ })).toBeDisabled();
	for (const menu of screen.getAllByRole("button", { name: "More actions" })) expect(menu).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: /^Current version/ }));
	fireEvent.click(screen.getByRole("button", { name: /^First/ }));
	expect(preparePreview).toHaveBeenCalledOnce();
	expect(useEditorStore.getState().historyVersionId).toBe("first");
	finish();
	await waitFor(() => expect(useEditorStore.getState().historyVersionId).toBe("second"));
	expect(screen.getByRole("button", { name: /^Current version/ })).toBeEnabled();
});

it("cancels a restore without changing the selected version", async () => {
	mocks.confirm.mockResolvedValue(false);
	const restore = vi.fn();
	useEditorStore.getState().setHistoryVersion("past");
	render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline
				source={source({
					loadError: false,
					versions: [
						{ id: "past", kind: "named", name: "سارة Checkpoint", createdAt: new Date("2026-11-18T10:00:00Z") },
					],
					restore,
				})}
			/>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
	await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
	expect(mocks.confirm.mock.calls[0]?.[0]).toContain("سارة Checkpoint");
	expect(mocks.confirm.mock.calls[0]?.[1]).toMatchObject({
		variant: "primary",
		confirmText: "Restore",
		cancelText: "Cancel",
	});
	expect(restore).not.toHaveBeenCalled();
	expect(useEditorStore.getState().historyVersionId).toBe("past");
});
it("uses the exact receipt for undo and keeps undo failures visible with recovery", async () => {
	const receipt = {
		ownerId: "alice",
		resumeId: "resume",
		versionId: "exact",
		expectedUpdatedAt: new Date(),
		editGeneration: 2,
	};
	const restoreWithUndo = vi.fn(async () => receipt);
	const undoRestore = vi.fn().mockRejectedValueOnce(new Error("Current work changed"));
	useEditorStore.getState().setHistoryVersion("past");
	render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline
				source={source({
					loadError: false,
					versions: [{ id: "past", kind: "auto", name: null, createdAt: new Date() }],
					restoreWithUndo,
					undoRestore,
				})}
			/>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
	fireEvent.click(await screen.findByRole("button", { name: "Undo restore" }));
	await waitFor(() => expect(undoRestore).toHaveBeenCalledWith(receipt));
	expect(screen.getByRole("alert")).toHaveTextContent("Current work changed");
	expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
});
it("retains letter restore compatibility without undo capabilities", async () => {
	const restore = vi.fn();
	useEditorStore.getState().setHistoryVersion("letter");
	render(
		<I18nProvider i18n={i18n}>
			<HistoryTimeline
				source={source({
					loadError: false,
					versions: [{ id: "letter", kind: "named", name: "Letter", createdAt: new Date() }],
					restore,
				})}
			/>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Restore this version" }));
	await waitFor(() => expect(restore).toHaveBeenCalledWith("letter"));
	expect(screen.queryByRole("button", { name: "Undo restore" })).toBeNull();
});
