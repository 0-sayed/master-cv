// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";

const verify = vi.hoisted(() => vi.fn());
vi.mock("@/libs/auth/client", () => ({ authClient: { twoFactor: { verifyTotp: verify } } }));
vi.mock("@/libs/root-context", () => ({ sessionQueryKey: ["auth", "session"] }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({
	useSearch: () => ({ callbackURL: "/dashboard" }),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn() }),
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
import { VerifyTwoFactorPage } from "./pages/verify-2fa";
import { getUiLocaleMessages } from "@/libs/locale";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("announces incomplete MFA codes in Arabic without submitting a request", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	const { container } = render(
		<I18nProvider i18n={i18n}>
			<VerifyTwoFactorPage />
		</I18nProvider>,
	);
	const input = container.querySelector('input[name="code"]');
	const form = container.querySelector("form");
	if (!input || !form) throw new Error("MFA needs a code input and form");
	fireEvent.change(input, { target: { value: "12" } });
	fireEvent.submit(form);
	await waitFor(() => expect(screen.getByText("يجب أن يتكوّن الرمز من 6 أرقام")).toBeDefined());
	expect(verify).not.toHaveBeenCalled();
});
