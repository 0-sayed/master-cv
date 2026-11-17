import type { Application } from "./types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { i18n } from "@lingui/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { applicationsListQueryKey } from "./queries";
import { useApplicationActions } from "./use-application-actions";
const api = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		applications: {
			list: { queryKey: () => ["applications", "list"] },
			stats: { queryKey: () => ["stats"] },
			tags: { queryKey: () => ["tags"] },
			getById: { queryKey: () => ["detail"] },
			update: { mutationOptions: () => ({ mutationFn: api.update }) },
			delete: { mutationOptions: () => ({ mutationFn: vi.fn() }) },
		},
		documents: { list: { key: () => ["documents"] } },
	},
}));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: vi.fn() } }));
it("blocks overlapping moves and uses the saved revision before a list refetch", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	const client = new QueryClient();
	const old = { id: "app", updatedAt: new Date("2026-11-17T00:00:00Z"), status: "saved" } as Application;
	const saved = { ...old, status: "applied", updatedAt: new Date("2026-11-17T00:00:01Z") };
	client.setQueryData(applicationsListQueryKey(), [old]);
	let finish!: (value: unknown) => void;
	api.update
		.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		)
		.mockResolvedValue({ ...saved, status: "interview" });
	const { result } = renderHook(() => useApplicationActions(), {
		wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
	});
	act(() => {
		result.current.moveTo(old, "applied");
		result.current.moveTo(old, "interview");
	});
	await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
	await act(async () => finish(saved));
	act(() => result.current.moveTo(old, "interview"));
	await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
	expect(api.update.mock.calls[1]?.[0]).toMatchObject({
		expectedUpdatedAt: "2026-11-17T00:00:01.000Z",
		status: "interview",
	});
});
