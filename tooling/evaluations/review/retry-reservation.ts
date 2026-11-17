import type { Budget } from "./budget";
import { withOpenRouterFee } from "./budget";
export type RetryReservation = {
	key: string;
	reservedMicros: number;
	reservedOpenRouterMicros: number;
	reservedOpenaiMicros: number;
};
/** Reserve both payers synchronously, then durably record the cumulative hold before transport. */
export async function reserveTransportRetry(input: {
	router: Budget;
	openai: Budget;
	held: RetryReservation;
	provider: string;
	micros: number;
	persist: (held: RetryReservation) => Promise<void>;
}) {
	const router = input.provider === "openai" ? 0 : withOpenRouterFee(input.micros);
	const openai = input.provider === "openai" ? input.micros : 0;
	if (input.router.consumed + router > input.router.capMicros) throw new Error("BUDGET_LIMIT");
	if (input.openai.consumed + openai > input.openai.capMicros) throw new Error("OPENAI_BUDGET_LIMIT");
	input.router.reserve(router);
	input.openai.reserve(openai);
	input.held.reservedOpenRouterMicros += router;
	input.held.reservedOpenaiMicros += openai;
	input.held.reservedMicros += router + openai;
	await input.persist({ ...input.held });
}
