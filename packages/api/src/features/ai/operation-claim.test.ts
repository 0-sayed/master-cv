import { afterEach, expect, it, vi } from "vite-plus/test";
const mocks = vi.hoisted(() => ({ tx: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@reactive-resume/db/owner-scope", () => ({
	withOwnerDatabase: (_ownerId: string, work: (tx: typeof mocks.tx) => unknown) => work(mocks.tx),
}));
vi.mock("../documents/ownership", () => ({ lockDocumentOwner: async () => undefined }));
import { claimNextOperation } from "./operations";
afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});
it.each(["queued", "running"])("claims %s operations without changing the trigger-owned deadline", async (state) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-20T12:00:00Z"));
	const now = Date.now();
	const createdAt = new Date(now - (state === "queued" ? 600000 : 60000));
	const deadlineAt = new Date(createdAt.getTime() + 120000);
	const operation = { id: "operation", state, createdAt, deadlineAt };
	mocks.tx.select
		.mockReturnValueOnce({
			from: () => ({ where: () => ({ orderBy: () => ({ limit: () => ({ for: async () => [operation] }) }) }) }),
		})
		.mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
	const set = vi.fn((_values: Record<string, unknown>) => ({
		where: async () => undefined,
	}));
	mocks.tx.update.mockReturnValue({ set });
	const lease = await claimNextOperation("owner");
	expect(lease).toMatchObject({ ownerId: "owner", operationId: "operation" });
	expect(lease?.token).toEqual(expect.any(String));
	expect(set).toHaveBeenCalledExactlyOnceWith({
		state: "running",
		leaseUntil: new Date(now + 60000),
		leaseToken: lease?.token,
	});
});
