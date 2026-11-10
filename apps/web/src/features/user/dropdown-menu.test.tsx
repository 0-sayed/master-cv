// @vitest-environment happy-dom

import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "@/features/locale/provider";

type SignOutOptions = { fetchOptions: { onSuccess: () => void } };

const router = vi.hoisted(() => ({ invalidate: vi.fn(), navigate: vi.fn() }));
const session = vi.hoisted(() => ({ user: { id: "user-1", name: "سارة العتيبي", email: "sara@example.test" } }));
const pending = vi.hoisted(() => ({ value: false }));
const signOut = vi.hoisted(() =>
	vi.fn(({ fetchOptions }: SignOutOptions) => {
		fetchOptions.onSuccess();
	}),
);

vi.mock("@tanstack/react-router", () => ({
	useRouter: () => router,
	useRouteContext: () => ({ session }),
	Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/libs/auth/client", () => ({
	authClient: { signOut, useSession: () => ({ data: pending.value ? null : session, isPending: pending.value }) },
}));
vi.mock("@/features/theme/provider", () => ({ useTheme: () => ({ theme: "light", setTheme: vi.fn() }) }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn(), close: vi.fn() } }));
vi.mock("@reactive-resume/ui/components/dropdown-menu", () => {
	const Passthrough = ({ children }: { children?: ReactNode }) => <>{children}</>;
	return {
		DropdownMenu: Passthrough,
		DropdownMenuContent: Passthrough,
		DropdownMenuGroup: Passthrough,
		DropdownMenuLabel: Passthrough,
		DropdownMenuRadioGroup: Passthrough,
		DropdownMenuRadioItem: Passthrough,
		DropdownMenuSeparator: () => null,
		DropdownMenuSub: Passthrough,
		DropdownMenuSubContent: Passthrough,
		DropdownMenuSubTrigger: Passthrough,
		DropdownMenuTrigger: () => null,
		DropdownMenuItem: ({
			children,
			onClick,
			render: element,
		}: {
			children?: ReactNode;
			onClick?: () => void;
			render?: ReactNode;
		}) =>
			element ? (
				<a href="/dashboard/settings/account">{children}</a>
			) : (
				<button type="button" onClick={onClick}>
					{children}
				</button>
			),
	};
});

i18n.loadAndActivate({ locale: "en", messages: {} });

const { UserDropdownMenu } = await import("./dropdown-menu");

describe("UserDropdownMenu", () => {
	it("keeps the resolved account menu visible while the live auth session initializes", () => {
		pending.value = true;
		try {
			render(
				<I18nProvider i18n={i18n}>
					<QueryClientProvider client={new QueryClient()}>
						<UserDropdownMenu>{() => <button type="button" />}</UserDropdownMenu>
					</QueryClientProvider>
				</I18nProvider>,
			);
			expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
			expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/dashboard/settings/account");
			expect(screen.getByText("سارة العتيبي")).toBeVisible();
			expect(screen.getByText("sara@example.test")).toBeVisible();
		} finally {
			pending.value = false;
		}
	});
	it("clears the previous user's cached queries when signing out", async () => {
		const queryClient = new QueryClient();
		queryClient.setQueryData(["resumes"], [{ id: "resume-1" }]);
		for (const key of [
			"reactive-resume:unsaved:cv",
			"letter-sender:letter",
			"career-context:thread",
			"career:offers-pair",
			"new-documents",
			"career-offers:thread",
		])
			localStorage.setItem(key, "personal");
		sessionStorage.setItem("career-debrief-draft:application:round", "personal");
		localStorage.setItem("documents-view", "list");

		render(
			<I18nProvider i18n={i18n}>
				<QueryClientProvider client={queryClient}>
					<LocaleProvider locale="en-US" session={null}>
						<UserDropdownMenu>{() => <button type="button" />}</UserDropdownMenu>
					</LocaleProvider>
				</QueryClientProvider>
			</I18nProvider>,
		);

		expect(screen.getAllByRole("button").map((button) => button.textContent?.trim())).toEqual(["Sign out"]);

		for (const label of ["Settings", "Language", "Theme"]) expect(screen.queryByText(label)).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => expect(router.invalidate).toHaveBeenCalled());
		expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
		expect(localStorage.getItem("reactive-resume:unsaved:cv")).toBeNull();
		expect(localStorage.getItem("letter-sender:letter")).toBeNull();
		expect(localStorage.getItem("career-context:thread")).toBeNull();
		expect(localStorage.getItem("career:offers-pair")).toBeNull();
		expect(localStorage.getItem("new-documents")).toBeNull();
		expect(localStorage.getItem("career-offers:thread")).toBeNull();
		expect(sessionStorage.getItem("career-debrief-draft:application:round")).toBeNull();
		expect(localStorage.getItem("documents-view")).toBe("list");
	});
});
