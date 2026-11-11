import { expect, it } from "vite-plus/test";
import {
	assistantAvailability,
	deriveAssistantState,
	selectConversationProvider,
	confirmedCancellation,
} from "./operation-state";

it("uses persisted operation outcomes ahead of availability and preserves retryable mutation failures", () => {
	const usage = {
		plan: "start" as const,
		operations: { limit: 5 as const, used: 0, reserved: 1, remaining: 4 },
		baseCvs: { limit: 1 as const, used: 1 },
	};
	const availability = { state: "ready" as const, reason: null };
	for (const state of [
		"queued",
		"running",
		"cancel_requested",
		"cancelled",
		"waiting_review",
		"succeeded",
		"failed",
	] as const) {
		const operation = {
			id: "operation",
			state,
			resultId: ["waiting_review", "succeeded"].includes(state) ? "operation" : null,
			failureCode: null,
		};
		expect(deriveAssistantState(availability, usage, operation, null, "idle").state).toBe(state);
		expect(deriveAssistantState(availability, usage, operation, null, "failed")).toMatchObject({
			state: "mutation_failed",
			operation,
			retryable: true,
		});
	}
	expect(deriveAssistantState(availability, usage, null, null, "idle").state).toBe("idle");
});

it("preserves a missing conversation binding and only defaults for a new conversation", () => {
	const providers = [{ id: "replacement" }];
	expect(selectConversationProvider(providers, { aiProviderId: "removed" }, null)).toBeUndefined();
	expect(selectConversationProvider(providers, undefined, null)).toEqual(providers[0]);
});
it("distinguishes disabled processing, outage, reservations and nonrenewing exhaustion", () => {
	expect(assistantAvailability({ state: "not_enabled", reason: "NO_APPROVED_ROUTE" }, 0)).toBe("not_enabled");
	expect(assistantAvailability({ state: "unavailable", reason: "WORKER_UNAVAILABLE" }, 5)).toBe("unavailable");
	expect(assistantAvailability({ state: "ready", reason: null }, 0, 1)).toBe("busy");
	expect(assistantAvailability({ state: "ready", reason: null }, 0, 0)).toBe("exhausted");
	expect(confirmedCancellation({ state: "cancel_requested" })).toBe(false);
	expect(confirmedCancellation({ state: "waiting_review" })).toBe(false);
	expect(confirmedCancellation({ state: "cancelled" })).toBe(true);
});
