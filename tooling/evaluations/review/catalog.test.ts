import { expect, it } from "vite-plus/test";
import { loadModels } from "./config";
import { refreshModels } from "./runner";
import { vertexFixture } from "./vertex-test-fixture";
const model = loadModels(undefined, undefined, false).slice(0, 1);
const transport = (endpoints: unknown[]) => () =>
	Promise.resolve(Response.json({ data: { id: "openai/gpt-6-luna", endpoints } }));
it("uses the most expensive allowed provider/cache/tier price rather than cheapest advertised rate", async () => {
	const result = await refreshModels(
		model,
		transport([
			{
				tag: "openai",
				supported_parameters: ["structured_outputs", "reasoning", "reasoning_effort", "response_format", "max_tokens"],
				pricing: {
					prompt: "0.0000001",
					completion: "0.0000005",
					input_cache_write: "0.000000125",
					overrides: [{ prompt: "0.0000002", completion: "0.00000075" }],
				},
			},
			{
				tag: "openai/us",
				supported_parameters: ["structured_outputs", "reasoning", "reasoning_effort", "response_format", "max_tokens"],
				pricing: { prompt: "0.00000011", completion: "0.00000055", input_cache_write: "0.0000001375" },
			},
			{ tag: "azure", supported_parameters: [], pricing: { prompt: "0.001", completion: "0.001" } },
		]),
	);
	expect(result[0]?.inputPerMillion).toBeCloseTo(0.2);
	expect(result[0]?.outputPerMillion).toBeCloseTo(0.75);
});
it("fails closed when pinned schema support, slug or pricing is unavailable", async () => {
	await expect(
		refreshModels(
			model,
			transport([
				{
					tag: "azure",
					supported_parameters: [
						"structured_outputs",
						"reasoning",
						"reasoning_effort",
						"response_format",
						"max_tokens",
					],
					pricing: { prompt: "1", completion: "1" },
				},
			]),
		),
	).rejects.toThrow("PINNED_PROVIDER_UNSUPPORTED");
	await expect(
		refreshModels(
			model,
			transport([{ tag: "openai", supported_parameters: ["reasoning"], pricing: { prompt: "1", completion: "1" } }]),
		),
	).rejects.toThrow("PINNED_PROVIDER_UNSUPPORTED");
	await expect(
		refreshModels(
			model,
			transport([
				{
					tag: "openai",
					supported_parameters: [
						"reasoning",
						"reasoning_effort",
						"structured_outputs",
						"response_format",
						"max_tokens",
					],
					pricing: { prompt: "unknown", completion: "1" },
				},
			]),
		),
	).rejects.toThrow("CATALOG_PRICE_UNKNOWN");
});
it("rejects an endpoint without an output-token limit or response_format", async () => {
	await expect(
		refreshModels(
			model,
			transport([
				{
					tag: "openai",
					supported_parameters: ["structured_outputs", "reasoning"],
					pricing: { prompt: "0.0000001", completion: "0.0000005" },
				},
			]),
		),
	).rejects.toThrow("PINNED_PROVIDER_UNSUPPORTED");
});

it("checks every grid variant against archived pinned parameter support without inference", async () => {
	const { default: snapshot } = await import("./catalog-snapshot.json");
	const models = loadModels();
	const refreshed = await refreshModels(models, async (url) => {
		const entry = snapshot.endpoints.find((e) => e.url === String(url));
		if (!entry) throw new Error("MISSING_CATALOG_METADATA");
		return Response.json(entry.body);
	});
	expect(refreshed).toHaveLength(11);
	expect(refreshed.map((m) => [m.model, m.provider, m.reasoning])).toEqual(
		models.map((m) => [m.model, m.provider, m.reasoning]),
	);
});

it("keeps Hydrogen public prices and the approved synthetic Google safety policy", async () => {
	const { default: snapshot } = await import("./catalog-snapshot.json");
	const hydrogen = [vertexFixture];
	expect(() => loadModels(undefined, [vertexFixture.model])).toThrow("UNKNOWN_MODEL");
	expect(hydrogen).toHaveLength(1);
	for (const model of hydrogen)
		expect(model).toMatchObject({
			provider: "google-vertex",
			providerEndpoint: "google-vertex/global",
			reasoning: "low",
			inputPerMillion: 1.5,
			outputPerMillion: 7.5,
		});
	const eligible = snapshot.zdrCatalog.body.data.filter((e) => e.model_id === "google/gemini-4-hydrogen");
	expect(eligible.length).toBeGreaterThan(0);
	expect(eligible.every((e) => e.safety_retention === true)).toBe(true);
	expect(eligible.some((e) => e.tag === "google-vertex/global")).toBe(true);
	const endpoint = snapshot.endpoints
		.find((e) => e.body.data.id === "google/gemini-4-hydrogen")
		?.body.data.endpoints.find((e) => e.tag === "google-vertex/global");
	expect(endpoint).toMatchObject({ status: 0, uptime_last_30m: 100 });
	expect(endpoint?.supported_parameters).toEqual(
		expect.arrayContaining(["reasoning", "reasoning_effort", "response_format", "structured_outputs", "max_tokens"]),
	);
});

it("selects only efforts enumerated by the refreshed public model catalog", async () => {
	const { default: snapshot } = await import("./catalog-snapshot.json");
	for (const model of loadModels()) {
		const catalog = snapshot.modelCatalog.body.data.find((m) => m.id === model.model);
		expect(catalog?.reasoning.supported_efforts).toContain(model.reasoning);
	}
	expect(() => loadModels(undefined, ["google/gemini-3.5-flash-lite"])).toThrow("UNKNOWN_MODEL");
	expect(() => loadModels(undefined, ["google/gemini-3.8-flash@low"])).toThrow("UNKNOWN_MODEL");
	expect(() => loadModels(undefined, ["google/gemini-3.8-flash@medium"])).toThrow("UNKNOWN_MODEL");
	expect(() => loadModels(undefined, ["google/gemini-4-hydrogen@medium"])).toThrow("UNKNOWN_MODEL");
	expect(() => loadModels(undefined, ["deepseek/deepseek-v4.1-flash-1017@medium"])).toThrow("UNKNOWN_MODEL");
});

it("refuses an unhealthy exact Vertex pin instead of falling back to another Vertex endpoint", async () => {
	const pinned = [
		{
			...vertexFixture,
			providerEndpoint: "google-vertex/global" as const,
		},
	];
	await expect(
		refreshModels(pinned, async () =>
			Response.json({
				data: {
					id: "google/gemini-4-hydrogen",
					endpoints: [
						{ tag: "google-vertex/global", status: -2, supported_parameters: [], pricing: {} },
						{ tag: "google-vertex/eu", status: 0, supported_parameters: [], pricing: {} },
					],
				},
			}),
		),
	).rejects.toThrow("PINNED_PROVIDER_UNHEALTHY");
});
