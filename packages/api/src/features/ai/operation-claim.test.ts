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
it.each(["queued", "running"])("starts the execution deadline only at the first claim: %s", async (state) => {
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
	const set = vi.fn((_values: { deadlineAt?: Date; leaseUntil: Date; leaseToken: string }) => ({
		where: async () => undefined,
	}));
	mocks.tx.update.mockReturnValue({ set });
	const lease = await claimNextOperation("owner");
	expect(lease).toMatchObject({ ownerId: "owner", operationId: "operation" });
	const update = set.mock.calls[0]?.[0] as { deadlineAt?: Date; leaseUntil: Date; leaseToken: string };
	expect(update.leaseUntil.getTime()).toBe(now + 60000);
	expect(update.leaseToken).toBe(lease?.token);
	if (state === "queued") expect(update.deadlineAt?.getTime()).toBe(now + 120000);
	else expect(update.deadlineAt).toBeUndefined();
});
