// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Dialog } from "@reactive-resume/ui/components/dialog";

const mocks = vi.hoisted(() => ({ disable: vi.fn(), close: vi.fn() }));
vi.mock("@/libs/auth/client", () => ({ authClient: { twoFactor: { disable: mocks.disable } } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: vi.fn() }) }));
vi.mock("@/hooks/use-form-blocker", () => ({ useFormBlocker: () => ({ requestClose: mocks.close }) }));
vi.mock("../store", () => ({
	useDialogStore: (select: (state: unknown) => unknown) => select({ closeDialog: mocks.close }),
}));
import { DisableTwoFactorDialog } from "./disable-two-factor";

it("cancels without disabling two-factor authentication", () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<Dialog open>
				<DisableTwoFactorDialog />
			</Dialog>
		</I18nProvider>,
	);
	fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
	expect(mocks.close).toHaveBeenCalledOnce();
	expect(mocks.disable).not.toHaveBeenCalled();
});
