import type { ApprovedRoute, ReasoningEffort } from "../production";
import type { TaskCase, TaskContract } from "./types";
import { completionTokenLimit } from "../production";

/** Bind contract limits to the caller's exact pinned route; never invent routing/credentials. */
export function buildTaskRoute(
	contract: TaskContract<TaskCase, unknown>,
	effort: ReasoningEffort,
	binding: ApprovedRoute,
	verification = false,
): ApprovedRoute {
	const { completionTokenCap: _coreCap, ...base } = binding;
	if (!Number.isSafeInteger(contract.deadlineMs) || contract.deadlineMs <= 0 || contract.deadlineMs > 120_000)
		throw new Error("TASK_INVALID_DEADLINE");
	const route: ApprovedRoute = {
		...base,
		maxOutputTokens: verification ? Math.min(4096, contract.verifierCap) : contract.visibleCap(effort),
		...(verification && contract.verifierCap > 4096 ? { completionTokenCap: contract.verifierCap } : {}),
		reasoningEffort: effort,
		callTimeoutMs: contract.deadlineMs,
		deadlineMs: contract.deadlineMs,
	};
	completionTokenLimit(route); // Enforce the installed production policy's visible/completion limits.
	return route;
}
