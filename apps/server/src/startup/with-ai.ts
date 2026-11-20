import type { AiRuntime } from "@reactive-resume/api/features/ai/route-policy";
import { withAiRuntime } from "@reactive-resume/api/features/ai/route-policy";

type WrappedFunction = (...args: never[]) => unknown;

export function composeAi(runtime: AiRuntime | null) {
	return {
		fetch<F extends WrappedFunction>(fetch: F): F {
			if (!runtime) return fetch;
			return ((...args: never[]) => withAiRuntime(runtime, () => fetch(...args))) as F;
		},
		run<T>(work: () => T): T {
			return runtime ? withAiRuntime(runtime, work) : work();
		},
	};
}
