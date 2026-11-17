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
import {
	benchmarkInput,
	benchmarkVerifierSpec,
	variantBenchmarkProtocol,
	variantBenchmarkVerifierVersion,
} from "./verifier";

it("keeps production writers, verifier payloads and schemas with explicit benchmark protocol guidance", () => {
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
		const input = benchmarkInput(fixture, goldOutput(fixture));
		expect({ ...input, selections: input.selections.slice(0, -1) }).toEqual(
			buildVariantVerificationPayload(snapshot, goldOutput(fixture)),
		);
		const context = input.selections.at(-1);
		expect(context && "id" in context ? context.id : null).toBe("benchmark-verification-context");
		expect(benchmarkVerifierSpec(fixture)).toEqual({
			version: variantBenchmarkVerifierVersion,
			systemPrompt: `${variantVerifierPrompt}\n\n${variantBenchmarkProtocol}`,
			schema: category === "translation" ? expect.anything() : variantVerifierSchema,
		});
		if (category === "translation")
			expect(benchmarkVerifierSpec(fixture).schema.toJSONSchema()).toMatchObject({
				properties: { quality: { required: expect.arrayContaining(["mqm"]) } },
			});
		expect(variantBenchmarkVerifierVersion).toBe(`${VARIANT_VERIFIER_VERSION}+benchmark-protocol-v4-compact-json`);
	}
});
