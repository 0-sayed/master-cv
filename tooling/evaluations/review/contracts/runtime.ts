import type { TaskCase, TaskCategory, TaskContract } from "./types";
import type { ModelPayload } from "@reactive-resume/api/features/ai/payload";
import type { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
import { variantOperationContracts } from "@reactive-resume/api/features/ai/variant-contracts";
import { getTaskContract } from "./index";

/** Task 1c supplies the versioned semantic verifier. No core-verifier fallback is safe for tasks. */
export type TaskVerifierAdapter = {
	version: string;
	systemPrompt: string;
	schema: z.ZodType<Record<string, unknown>>;
	buildInput(c: TaskCase, output: Record<string, unknown>): ModelPayload;
	/** Scripted offline transport only; never evidence of semantic model quality. */
	fakeVerdict(c: TaskCase, output: Record<string, unknown>): Record<string, unknown>;
	auditFault(c: TaskCase, output: Record<string, unknown>, verdict: unknown): string | null;
	assess(
		c: TaskCase,
		output: Record<string, unknown>,
		verdict: Record<string, unknown>,
	): {
		accepted: boolean;
		qualityAccepted: boolean | null;
		responseAssessment: { status: string; reason: string } | null;
		retention: "retained" | "lost" | "unclear" | "not_applicable" | null;
		assessment: string | null;
		usefulness: string | null;
	};
};

type TaskRuntime = {
	contract(category: TaskCategory): TaskContract<TaskCase, unknown>;
	verifier?: TaskVerifierAdapter;
};
const scope = new AsyncLocalStorage<TaskRuntime>();
/** Scope injection matches the existing production runtime; tests cannot populate the real registry. */
export const withTaskRuntime = <T>(runtime: TaskRuntime, work: () => T): T => scope.run(runtime, work);
export const taskContractFor = (c: TaskCase) => (scope.getStore()?.contract ?? getTaskContract)(c.category);
/** Injected harness contracts retain their own schema and verifier protocol. */
export function isProductionVariantCase(c: TaskCase) {
	const kind = `review.${c.category}` as keyof typeof variantOperationContracts;
	return (
		Object.hasOwn(variantOperationContracts, kind) &&
		taskContractFor(c).outputSchema === variantOperationContracts[kind].output
	);
}
export function taskVerifierFor(defaultVerifier?: TaskVerifierAdapter): TaskVerifierAdapter {
	// An explicitly injected runtime still requires its own judge; production uses the versioned default.
	const runtime = scope.getStore();
	const verifier = runtime ? runtime.verifier : defaultVerifier;
	if (!verifier) throw new Error("TASK_VERIFIER_REQUIRED");
	return verifier;
}
