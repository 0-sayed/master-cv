// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { useCurrentSession } from "./use-current-session";

const snapshots = vi.hoisted(() => ({
	root: { user: { id: "user-1", name: "سارة العتيبي" } },
	live: { data: null as { user: { id: string; name: string } } | null, isPending: true },
}));
vi.mock("@tanstack/react-router", () => ({ useRouteContext: () => ({ session: snapshots.root }) }));
vi.mock("@/libs/auth/client", () => ({ authClient: { useSession: () => snapshots.live } }));

beforeEach(() => {
	snapshots.live = { data: null, isPending: true };
});

it("keeps resolved identity on the first pending frame", () => {
	expect(renderHook(useCurrentSession).result.current?.user.name).toBe("سارة العتيبي");
});
it("uses the live session once initialized, including updated profile and security state", () => {
	const { result, rerender } = renderHook(useCurrentSession);
	snapshots.live = { data: { user: { id: "user-1", name: "Updated name" } }, isPending: false };
	rerender();
	expect(result.current?.user.name).toBe("Updated name");
});
it("does not revive the cached identity after an authoritative sign-out", () => {
	snapshots.live = { data: null, isPending: false };
	expect(renderHook(useCurrentSession).result.current).toBeNull();
});
