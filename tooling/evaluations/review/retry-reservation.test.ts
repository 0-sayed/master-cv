import { expect, it } from "vite-plus/test";
import { Budget } from "./budget";
import { reserveTransportRetry, type RetryReservation } from "./retry-reservation";
it("reserves retry funds before persistence and prevents two concurrent requests from buying the same capacity", async () => {
	const router = new Budget(100);
	const openai = new Budget(100);
	const held: RetryReservation = { key: "a", reservedMicros: 0, reservedOpenRouterMicros: 0, reservedOpenaiMicros: 0 };
	const snapshots: number[] = [];
	const result = await Promise.allSettled(
		[1, 2].map(() =>
			reserveTransportRetry({
				router,
				openai,
				held,
				provider: "openai",
				micros: 60,
				persist: async () => {
					snapshots.push(openai.consumed);
				},
			}),
		),
	);
	expect(result.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
	expect(snapshots).toEqual([60]);
	expect(held.reservedOpenaiMicros).toBe(60);
	expect(router.consumed).toBe(0);
});
it("retains an immutable cumulative hold for resume and settles every purchased attempt once", async () => {
	const router = new Budget(1000);
	const openai = new Budget(1000);
	const held: RetryReservation = {
		key: "a",
		reservedMicros: 100,
		reservedOpenRouterMicros: 100,
		reservedOpenaiMicros: 0,
	};
	router.reserve(100);
	let saved: RetryReservation | undefined;
	await reserveTransportRetry({
		router,
		openai,
		held,
		provider: "together",
		micros: 50,
		persist: async (r) => {
			saved = r;
		},
	});
	expect(saved).toEqual({ ...held });
	expect(router.consumed).toBe(153);
	router.settle(held.reservedOpenRouterMicros, 70);
	expect(router.consumed).toBe(70);
	expect(saved?.reservedMicros).toBe(153);
});
