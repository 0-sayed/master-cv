import { afterEach, expect, it, vi } from "vite-plus/test";
const work = vi.hoisted(() => ({
	discover: vi.fn(),
	reconcile: vi.fn(),
	claim: vi.fn(),
	lease: vi.fn(),
	failed: vi.fn(),
}));
vi.mock("./operations", () => ({
	discoverAiOwners: work.discover,
	reconcileExpiredAccounting: work.reconcile,
	claimNextOperation: work.claim,
	withOperationLease: work.lease,
	failOperation: work.failed,
	heartbeatOperation: vi.fn(),
	assertSourceRevisions: vi.fn(),
	deliverOperation: vi.fn(),
	operationRequest: vi.fn(),
}));
import { runAiOperations } from "./operation-worker";
afterEach(() => vi.resetAllMocks());
it("starts all admitted owners concurrently and drains every active lease on shutdown", async () => {
	const owners = Array.from({ length: 100 }, (_, i) => `owner-${i}`);
	work.discover.mockResolvedValue(owners);
	work.reconcile.mockResolvedValue(undefined);
	work.claim.mockImplementation(async (ownerId: string) => ({ ownerId, operationId: ownerId, token: ownerId }));
	const pending: Array<() => void> = [];
	work.lease.mockImplementation(
		() => new Promise((_resolve, reject) => pending.push(() => reject(new Error("Synthetic lease finished")))),
	);
	work.failed.mockResolvedValue(undefined);
	const controller = new AbortController();
	let drained = false;
	const running = runAiOperations(controller.signal).then(() => {
		drained = true;
	});
	try {
		await vi.waitFor(() => expect(pending).toHaveLength(100));
		controller.abort();
		expect(drained).toBe(false);
	} finally {
		controller.abort();
		for (const finish of pending) finish();
		await running;
	}
	expect(drained).toBe(true);
	expect(work.failed).toHaveBeenCalledTimes(100);
});

it("drains other leases before reporting a failed claim", async () => {
	work.discover.mockResolvedValue(["unavailable-owner", "active-owner"]);
	work.reconcile.mockResolvedValue(undefined);
	work.claim.mockImplementation(async (ownerId: string) => {
		if (ownerId === "unavailable-owner") throw new Error("Synthetic claim failure");
		return { ownerId, operationId: ownerId, token: ownerId };
	});
	let finish: () => void = () => undefined;
	work.lease.mockImplementation(
		() =>
			new Promise((_resolve, reject) => {
				finish = () => reject(new Error("Synthetic lease finished"));
			}),
	);
	work.failed.mockResolvedValue(undefined);
	let settled = false;
	const running = runAiOperations(undefined, 2).catch((error: unknown) => {
		settled = true;
		return error;
	});
	try {
		await vi.waitFor(() => expect(work.lease).toHaveBeenCalledTimes(1));
		expect(settled).toBe(false);
	} finally {
		finish();
	}
	const error = await running;
	expect(error).toBeInstanceOf(AggregateError);
	expect((error as AggregateError).errors).toEqual([new Error("Synthetic claim failure")]);
	expect(work.failed).toHaveBeenCalledTimes(1);
});
