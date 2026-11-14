import { expect, it } from "vite-plus/test";
import {
	buildVariantWriterPayload,
	variantOperationContracts,
} from "@reactive-resume/api/features/ai/variant-contracts";
import {
	buildVariantVerificationPayload,
	VARIANT_VERIFIER_VERSION,
	variantVerifierPrompt,
	variantVerifierSchema,
} from "@reactive-resume/api/features/ai/variant-verifier";
import { taskContractFor } from "./contracts/runtime";
import { variantSnapshot } from "./contracts/variant-adapter";
import { prepareCase, goldOutput } from "./execution";
import { loadStudyCases } from "./study";
import { benchmarkInput, benchmarkVerifierSpec } from "./verifier";

it("uses identical production writer and complete verifier bytes for all four categories", () => {
	const scope = ["summary", "job-evidence", "tailoring", "translation"] as const;
	const cases = loadStudyCases("tasks-v1", [...scope]);
	for (const category of scope) {
		const fixture = cases.find((c) => c.kind === "task" && c.category === category);
		if (!fixture || fixture.kind !== "task") throw new Error("MISSING_FIXTURE");
		const snapshot = variantSnapshot(fixture);
		const contract = taskContractFor(fixture);
		const production = variantOperationContracts[`review.${category}`];
		expect(contract.outputSchema).toBe(production.output);
		expect(contract.systemPrompt).toBe(production.systemPrompt);
		expect(contract.promptVersion).toBe(production.promptVersion);
		expect(contract.schemaVersion).toBe(production.schemaVersion);
		expect(prepareCase(fixture).payload).toEqual(buildVariantWriterPayload(snapshot));
		expect(benchmarkInput(fixture, goldOutput(fixture))).toEqual(
			buildVariantVerificationPayload(snapshot, goldOutput(fixture)),
		);
		expect(benchmarkVerifierSpec(fixture)).toEqual({
			version: VARIANT_VERIFIER_VERSION,
			systemPrompt: variantVerifierPrompt,
			schema: variantVerifierSchema,
		});
	}
});
