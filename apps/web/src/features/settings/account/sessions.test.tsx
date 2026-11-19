// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionsSection } from "./sessions";
const revoke = vi.hoisted(() => vi.fn());
vi.mock("@/libs/orpc/client", () => ({ client: { privacy: { revokeSessions: revoke } } }));
afterEach(() => {
	cleanup();
	revoke.mockReset();
});
function show(others = true, supplied?: Parameters<typeof SessionsSection>[0]["sessions"]) {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const query = new QueryClient();
	const refresh = vi.spyOn(query, "invalidateQueries");
	const sessions = [
		{
			id: "current",
			current: true,
			createdAt: "2026-11-14T00:00:00Z",
			lastActiveAt: null,
			expiresAt: "2026-12-14T00:00:00Z",
			deviceLabel: null,
		},
		...(others
			? [
					{
						id: "other",
						current: false,
						createdAt: "2026-11-14T00:00:00Z",
						lastActiveAt: null,
						expiresAt: "2026-12-14T00:00:00Z",
						deviceLabel: null,
					},
				]
			: []),
	];
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={query}>
				<SessionsSection sessions={supplied ?? sessions} />
			</QueryClientProvider>
		</I18nProvider>,
	);
	return refresh;
}
it("revokes only the selected opaque session handle and refreshes after success", async () => {
	revoke.mockResolvedValue(undefined);
	const refresh = show();
	fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
	await waitFor(() => expect(revoke).toHaveBeenCalledExactlyOnceWith({ id: "other" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
	expect(screen.getByText("This device")).toBeDefined();
});
it("failed revocation retains devices and offers retry without claiming success", async () => {
	revoke.mockRejectedValue(new Error("offline"));
	const refresh = show();
	fireEvent.click(screen.getByRole("button", { name: "Sign out of all other devices" }));
	fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
	expect(await screen.findByRole("alert")).toBeDefined();
	expect(screen.getAllByText("Unknown browser")).toHaveLength(2);
	expect(refresh).not.toHaveBeenCalled();
	revoke.mockResolvedValue(undefined);
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	fireEvent.click(screen.getByRole("button", { name: "Sign out of all other devices" }));
	fireEvent.click(screen.getByRole("button", { name: "Confirm sign out" }));
	await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
	expect(revoke).toHaveBeenLastCalledWith({ others: true });
});
it("successful empty other-device state cannot revoke the current session", () => {
	show(false);
	expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Sign out of all other devices" })).toBeNull();
});

it("lists the current session before recent and older sessions, with honest unknown browser times", () => {
	const session = (id: string, current: boolean, lastActiveAt: string) => ({
		id,
		current,
		createdAt: "2026-11-12T00:00:00Z",
		lastActiveAt,
		expiresAt: "2026-12-14T00:00:00Z",
		deviceLabel: current ? "Chrome on Linux" : null,
	});
	const sessions = [
		session("old", false, "2026-11-13T00:00:00Z"),
		session("recent", false, "2026-11-15T00:00:00Z"),
		session("current", true, "2026-11-14T00:00:00Z"),
	];
	show(true, sessions);
	const rows = [...document.querySelectorAll('[data-slot="settings-row"]')];
	expect(rows[0]).toHaveTextContent("This device");
	expect(rows[1]?.querySelector("time")).toHaveAttribute("dateTime", "2026-11-15T00:00:00Z");
	expect(rows[2]?.querySelector("time")).toHaveAttribute("dateTime", "2026-11-13T00:00:00Z");
	expect(screen.queryByText("Signed in")).toBeNull();
	expect(screen.getAllByText("Unknown browser")).toHaveLength(2);
	expect(sessions.map((item) => item.id)).toEqual(["old", "recent", "current"]);
});

it("limits the initial list and requires confirmation before revoking other devices", () => {
	const supplied = Array.from({ length: 10 }, (_, i) => ({
		id: String(i),
		current: i === 7,
		createdAt: "2026-11-14T00:00:00Z",
		lastActiveAt: null,
		expiresAt: "2026-12-14T00:00:00Z",
		deviceLabel: `Chrome · Linux ${i}`,
	}));
	show(true, supplied);
	expect(screen.getAllByText(/Chrome · Linux/)).toHaveLength(5);
	fireEvent.click(screen.getByRole("button", { name: "Show all 10" }));
	expect(screen.getAllByText(/Chrome · Linux/)).toHaveLength(10);
	fireEvent.click(screen.getByRole("button", { name: "Sign out of all other devices" }));
	expect(screen.getByRole("alertdialog")).toBeDefined();
	expect(revoke).not.toHaveBeenCalled();
});
