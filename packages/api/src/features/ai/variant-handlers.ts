import type { OperationHandler } from "./route-policy";
import type { VariantOperationKind } from "@reactive-resume/schema/resume/variants";
import { withOwnerDatabase } from "@reactive-resume/db/client";
import { buildVariantWriterPayload, variantOperationContracts } from "./variant-contracts";
import { loadVariantSnapshot } from "./variant-sources";
import { validateVariantOutput } from "./variant-validation";
import {
	assertVariantVerification,
	buildVariantVerificationPayload,
	variantVerifierPrompt,
	variantVerifierSchema,
} from "./variant-verifier";

function makeHandler(kind: VariantOperationKind): OperationHandler {
	const contract = variantOperationContracts[kind];
	return {
		...contract,
		resultState: "waiting_review",
		validateRequest: async (tx, ownerId, request) => {
			await loadVariantSnapshot(tx, ownerId, request);
		},
		buildInput: () => {
			throw new Error("AI_PREPARED_PAYLOAD_REQUIRED");
		},
		buildPayload: (ownerId, request) =>
			withOwnerDatabase(ownerId, async (tx) => {
				const snapshot = await loadVariantSnapshot(tx, ownerId, request);
				return buildVariantWriterPayload(snapshot);
			}),
		validateResult: async (tx, ownerId, request, output) =>
			validateVariantOutput(await loadVariantSnapshot(tx, ownerId, request), output),
		verifier: {
			output: variantVerifierSchema,
			systemPrompt: variantVerifierPrompt,
			buildInput: () => {
				throw new Error("AI_VERIFICATION_CONTEXT_REQUIRED");
			},
			validate: () => {
				throw new Error("AI_VERIFICATION_CONTEXT_REQUIRED");
			},
			buildInputInContext: async (tx, ownerId, request, output) =>
				buildVariantVerificationPayload(await loadVariantSnapshot(tx, ownerId, request), output),
			validateInContext: async (tx, ownerId, request, output, verdict) =>
				assertVariantVerification(await loadVariantSnapshot(tx, ownerId, request), output, verdict),
		},
	};
}

/** Server composition only. No approved routes are enabled by this registry. */
export const variantReviewHandlers = Object.fromEntries(
	Object.keys(variantOperationContracts).map((kind) => [kind, makeHandler(kind as VariantOperationKind)]),
) as Record<VariantOperationKind, OperationHandler>;
