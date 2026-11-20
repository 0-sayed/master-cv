// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { WelcomePage } from "./welcome";
import { loadUiLocale } from "@/libs/locale";

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	completeWelcome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useRouteContext: () => ({ session: { user: { name: "Demo User" } } }),
}));
vi.mock("@/libs/orpc/client", () => ({
	client: { career: { personalWorkspace: { completeWelcome: mocks.completeWelcome } } },
}));
beforeEach(() => {
	mocks.navigate.mockReset();
	mocks.completeWelcome.mockReset().mockResolvedValue(undefined);
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
});

function renderPage() {
	return render(
		<I18nProvider i18n={i18n}>
			<WelcomePage />
		</I18nProvider>,
	);
}

it("puts the primary action before a numbered vertical list and retains the privacy notice", () => {
	const { container } = renderPage();
	const primary = screen.getByRole("button", { name: "Get started" });
	const list = screen.getByRole("list");
	expect(primary.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	expect(screen.getAllByRole("listitem")).toHaveLength(3);
	expect(screen.getByText("Download your CV")).toBeVisible();
	expect(screen.getByText("Your CV belongs to you")).toBeVisible();
	expect(container.querySelector("section[aria-labelledby='welcome-title']")).not.toBeNull();
	expect(container.querySelector("section[data-slot='section-card']")).not.toBeNull();
});

it("loads the approved Arabic privacy copy and shows Latin step numbers in RTL", async () => {
	await loadUiLocale("ar-SA");
	const { container } = renderPage();
	expect(screen.getByText(/نستخدم ملفك لبناء سيرتك/u)).toBeVisible();
	expect(screen.queryByText(/We use your file to build your CV/u)).toBeNull();
	expect([...container.querySelectorAll("ol > li > bdi")].map((node) => node.textContent)).toEqual(["1", "2", "3"]);
	expect([...container.querySelectorAll("ol > li > bdi")].every((node) => node.getAttribute("dir") === "ltr")).toBe(
		true,
	);
});

it("keeps the primary action connected to the career information route", async () => {
	renderPage();
	fireEvent.click(screen.getByRole("button", { name: "Get started" }));
	await waitFor(() => expect(mocks.completeWelcome).toHaveBeenCalledWith({}));
	expect(mocks.navigate).toHaveBeenCalledWith({ to: "/dashboard/career/information", replace: true });
});
