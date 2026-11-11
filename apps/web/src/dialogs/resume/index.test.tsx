// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Dialog } from "@reactive-resume/ui/components/dialog";
import { useDialogStore } from "../store";
import { DuplicateResumeDialog, UpdateResumeDialog } from "./index";
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), mutate: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({ mutate: mocks.mutate, isPending: false }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock("@/features/resume/builder/draft", () => ({ usePatchResume: () => vi.fn() }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => mocks.confirm }));
vi.mock("@/components/input/chip-input", () => ({ ChipInput: () => <span>Tags</span> }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: { resume: { update: { mutationOptions: () => ({}) }, duplicate: { mutationOptions: () => ({}) } } },
}));
beforeEach(() => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	vi.clearAllMocks();
	useDialogStore.setState({ open: true, onBeforeClose: null });
});
it.each([UpdateResumeDialog, DuplicateResumeDialog])(
	"offers neutral Cancel and preserves the dirty-form close guard (%s)",
	async (Component) => {
		render(
			<I18nProvider i18n={i18n}>
				<Dialog open>
					<Component data={{ id: "cv", name: "Original", slug: "original", tags: [] }} />
				</Dialog>
			</I18nProvider>,
		);
		const cancel = screen.getByRole("button", { name: "Cancel" });
		expect(cancel).toHaveClass("bg-surface");
		fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Changed" } });
		mocks.confirm.mockResolvedValueOnce(false);
		fireEvent.click(cancel);
		await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
		expect(useDialogStore.getState().open).toBe(true);
		mocks.confirm.mockResolvedValueOnce(true);
		fireEvent.click(cancel);
		await waitFor(() => expect(useDialogStore.getState().open).toBe(false));
		expect(mocks.mutate).not.toHaveBeenCalled();
	},
);
