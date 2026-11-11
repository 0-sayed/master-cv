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
}));
vi.mock("@/features/resume/builder/draft", () => ({
	savePendingChanges: mocks.save,
	useCurrentResume: () => ({ id: "resume", isLocked: false }),
	useResumeStore: { getState: () => ({ replaceResumeFromServer: mocks.replace }) },
}));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn(), usePrompt: () => vi.fn() }));
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
	expect(screen.getByRole("list", { name: "Versions" })).toHaveTextContent("Now");
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
	expect(screen.getByRole("button", { name: /^Now/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Back to now" })).toBeDisabled();
	expect(screen.getByRole("button", { name: /^First/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: /^Second/ })).toBeDisabled();
	expect(screen.getByRole("button", { name: "Options for First" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: /^Now/ }));
	fireEvent.click(screen.getByRole("button", { name: /^First/ }));
	expect(preparePreview).toHaveBeenCalledOnce();
	expect(useEditorStore.getState().historyVersionId).toBe("first");
	finish();
	await waitFor(() => expect(useEditorStore.getState().historyVersionId).toBe("second"));
	expect(screen.getByRole("button", { name: /^Now/ })).toBeEnabled();
});
