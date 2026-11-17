import type { CoverLetterDraftInput } from "../../dto/cover-letter";
import { ORPCError } from "@orpc/client";

export function draftLetterBody(
	_input: CoverLetterDraftInput & { userId: string; signal?: AbortSignal | undefined },
): Promise<AsyncGenerator<string>> {
	return Promise.reject(new ORPCError("PRECONDITION_FAILED", { message: "Use reviewed cover-letter generation." }));
}
