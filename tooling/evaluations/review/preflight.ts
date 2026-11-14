import { createHash } from "node:crypto";
import { z } from "zod";
import { variantCases, type ModelConfig } from "./config";
import { goldOutput, prepareCase, assertTaskGoldFits, type ExecutionCase } from "./execution";
import { executeApprovedStep, withAiRuntime, completionTokenLimit } from "./production";
import { required } from "./required";
import { routeFor, verifierModelFor } from "./runner";
import { benchmarkInput, benchmarkVerifierSpec } from "./verifier";

type Schema = {
	type?: string | string[];
	$ref?: string;
	$defs?: Record<string, Schema>;
	definitions?: Record<string, Schema>;
	anyOf?: Schema[];
	properties?: Record<string, Schema>;
	required?: string[];
	additionalProperties?: unknown;
	items?: Schema;
};
function fail(detail: string): never {
	throw new Error(`REQUEST_SCHEMA_ERROR: ${detail}`);
}
/** OpenAI/Azure strict subset, also used for Together's closed structured output. */
export function assertStrictOutputSchema(value: unknown, root: unknown = value, seen = new Set<Schema>()): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) fail("schema must be a typed object");
	const node = value as Schema;
	if (seen.has(node)) return;
	seen.add(node);
	if (node.$ref) {
		if (!node.$ref.startsWith("#/")) fail("external schema reference");
		let target: unknown = root;
		for (const key of node.$ref.slice(2).split("/")) {
			if (!target || typeof target !== "object") fail("unresolved schema reference");
			target = (target as Record<string, unknown>)[key.replaceAll("~1", "/").replaceAll("~0", "~")];
		}
		if (!target || typeof target !== "object") fail("unresolved schema reference");
		assertStrictOutputSchema(target as Schema, root, seen);
		return;
	}
	if (node.anyOf?.length) {
		for (const branch of node.anyOf) assertStrictOutputSchema(branch, root, seen);
		return;
	}
	const types = Array.isArray(node.type) ? node.type : [node.type];
	if (
		types.some((type) => !type || !["object", "array", "string", "number", "integer", "boolean", "null"].includes(type))
	)
		fail("every schema node must have a type");
	if (types.includes("object")) {
		if (!node.properties || node.additionalProperties !== false) fail("objects must be closed");
		const keys = Object.keys(node.properties);
		if (node.required?.length !== keys.length || !keys.every((key) => node.required?.includes(key)))
			fail("every property must be required");
		for (const value of Object.values(node.properties)) assertStrictOutputSchema(value, root, seen);
	}
	if (types.includes("array")) {
		if (!node.items) fail("array items required");
		assertStrictOutputSchema(node.items, root, seen);
	}
}
/** Serializes with the actual adapter/SDK into an injected, network-free transport. */
export async function preflightRequests(models: ModelConfig[], cases: ExecutionCase[]) {
	const requests: {
		model: string;
		reasoning: string;
		category: string;
		caseId: string;
		role: string;
		bodyHash: string;
		completionTokenCap: number;
	}[] = [];
	for (const writer of models) {
		for (const c of variantCases(writer, cases)) {
			const prepared = prepareCase(c);
			const verifier = benchmarkVerifierSpec(c);
			for (const spec of [
				{
					role: "writer",
					model: writer,
					schema: prepared.handler.output,
					system: prepared.handler.systemPrompt,
					payload: prepared.payload,
				},
				{
					role: "verifier",
					model: verifierModelFor(writer),
					schema: verifier.schema,
					system: verifier.systemPrompt,
					payload: benchmarkInput(c, goldOutput(c)),
				},
			]) {
				// Vertex uses JSON object mode, never submits the strict dialect for compilation.
				// Validate its complete locally enforced schema too, so untyped values cannot hide there.
				assertStrictOutputSchema(z.toJSONSchema(spec.schema, { unrepresentable: "any" }));
				const route = routeFor(spec.model, "offline-preflight", spec.role === "verifier", c);
				if (spec.role === "writer") assertTaskGoldFits(c, route);
				let captured = false;
				let problem: unknown;
				await withAiRuntime(
					{
						routes: [],
						handlers: {},
						workerAvailable: false,
						fetch: (_url, init) => {
							try {
								const body = JSON.parse(String(init?.body));
								const vertex =
									route.model.startsWith("google/gemini-") && route.downstreamProvider.startsWith("google-vertex");
								if (
									body.model !== route.model ||
									!Array.isArray(body.messages) ||
									!body.messages.length ||
									body.tools ||
									body.stream === true
								)
									fail("invalid completion body");
								if (
									body.reasoning?.effort !== route.reasoningEffort ||
									body.reasoning.exclude !== true ||
									!Number.isSafeInteger(body.max_tokens) ||
									body.max_tokens !== completionTokenLimit(route)
								)
									fail("invalid reasoning or completion cap");
								if (
									JSON.stringify(body.provider.only) !== JSON.stringify([route.downstreamProvider]) ||
									body.provider.allow_fallbacks !== false ||
									body.provider.require_parameters !== true ||
									body.provider.data_collection !== "deny"
								)
									fail("provider pin or policy");
								if (body.provider.zdr !== (route.downstreamProvider === "openai" ? undefined : true))
									fail("ZDR policy");
								if (vertex) {
									if (
										body.response_format?.type !== "json_object" ||
										!body.messages.some(
											(m: { content?: unknown }) =>
												typeof m.content === "string" && m.content.includes("complete schema:"),
										)
									)
										fail("Vertex JSON object contract");
								} else {
									if (body.response_format?.type !== "json_schema" || body.response_format.json_schema?.strict !== true)
										fail("strict response format");
									if (body.response_format.json_schema.schema?.type !== "object") fail("root must be an object");
									assertStrictOutputSchema(body.response_format.json_schema.schema);
								}
								requests.push({
									model: writer.model,
									reasoning: writer.reasoning,
									category: c.category,
									caseId: c.id,
									role: spec.role,
									completionTokenCap: body.max_tokens,
									bodyHash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
								});
								captured = true;
							} catch (error) {
								problem = error;
							}
							return Promise.resolve(
								Response.json({ error: { code: 400, message: "OFFLINE_PREFLIGHT_NO_DISPATCH" } }, { status: 400 }),
							);
						},
					},
					() =>
						executeApprovedStep({
							route,
							operationId: "preflight",
							attemptId: "0",
							stepId: spec.role,
							payload: spec.payload,
							outputSchema: spec.schema,
							systemPrompt: required(spec.system),
							signal: new AbortController().signal,
						}),
				);
				if (problem) throw problem;
				if (!captured) fail("adapter did not serialize request");
			}
		}
	}
	return { passed: true, networkRequests: 0, requests };
}
