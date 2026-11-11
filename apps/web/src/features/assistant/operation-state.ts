import type {
	AiAvailability,
	OperationState,
	OperationView,
	ResumeOutcome,
} from "@reactive-resume/schema/ai-operation";
import type { StartUsageView } from "@reactive-resume/schema/ai-usage";

export type AssistantState =
	| { state: "idle" | "not_enabled" | "unavailable" | "exhausted" | "busy" }
	| { state: OperationState; operation: OperationView; resume: ResumeOutcome | null }
	| { state: "mutation_pending" | "mutation_failed"; operation: OperationView | null; retryable: boolean };

export function deriveAssistantState(
	availability: AiAvailability,
	usage: StartUsageView,
	operation: OperationView | null,
	resume: ResumeOutcome | null,
	mutation: "idle" | "pending" | "failed",
): AssistantState {
	if (mutation !== "idle")
		return {
			state: mutation === "pending" ? "mutation_pending" : "mutation_failed",
			operation,
			retryable: mutation === "failed",
		};
	if (operation) return { state: operation.state, operation, resume };
	const state = assistantAvailability(availability, usage.operations.remaining, usage.operations.reserved);
	return { state: state === "ready" ? "idle" : state === "loading" ? "unavailable" : state };
}

export function selectConversationProvider<T extends { id: string }>(
	providers: readonly T[],
	conversation: { aiProviderId: string | null } | undefined,
	draftProviderId: string | null,
): T | undefined {
	if (conversation) return providers.find((provider) => provider.id === conversation.aiProviderId);
	return providers.find((provider) => provider.id === draftProviderId) ?? providers[0];
}

export function assistantAvailability(
	availability: AiAvailability | undefined,
	remaining: number | undefined,
	reserved = 0,
) {
	if (!availability) return "loading";
	if (availability.state !== "ready") return availability.state;
	if (remaining === undefined) return "loading";
	if (remaining === 0) return reserved > 0 ? "busy" : "exhausted";
	return "ready";
}

export const confirmedCancellation = (operation: { state: OperationState }) => operation.state === "cancelled";
