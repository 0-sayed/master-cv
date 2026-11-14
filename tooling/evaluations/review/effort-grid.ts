import type { ModelConfig } from "./config";
import { z } from "zod";
import { refreshModels } from "./runner";

type Metadata = { modelCatalog: { body: unknown }; endpoints: { url: string; body: unknown }[] };
/** Public metadata only. Model effort enumeration plus the pinned endpoint's parameters/caps;
 * endpoints do not publish a separate per-effort acceptance matrix. Never inference evidence. */
export async function checkEffortGrid(models: ModelConfig[], metadata: Metadata) {
	const catalog = z
		.object({
			data: z.array(
				z.object({
					id: z.string(),
					reasoning: z.object({ mandatory: z.boolean().optional(), supported_efforts: z.array(z.string()) }),
				}),
			),
		})
		.parse(metadata.modelCatalog.body);
	const accepted: ModelConfig[] = [];
	const dropped: { model: string; provider: string; reasoning: string; reason: string }[] = [];
	for (const model of models) {
		const entry = catalog.data.find((m) => m.id === model.model);
		if (!entry) throw new Error("CATALOG_MODEL_MISSING");
		if (
			!entry.reasoning.supported_efforts.includes(model.reasoning) ||
			(entry.reasoning.mandatory && model.reasoning === "none")
		) {
			dropped.push({ ...model, reason: "UNSUPPORTED_EFFORT" });
			continue;
		}
		try {
			accepted.push(
				...(await refreshModels([model], async (url) => {
					const endpoint = metadata.endpoints.find((e) => e.url === String(url));
					if (!endpoint) throw new Error("CATALOG_ENDPOINT_MISSING");
					return await Promise.resolve(Response.json(endpoint.body));
				})),
			);
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!["PINNED_PROVIDER_UNSUPPORTED", "PINNED_PROVIDER_UNHEALTHY", "OUTPUT_LIMIT_UNSUPPORTED"].includes(
					error.message,
				)
			)
				throw error;
			dropped.push({ ...model, reason: error.message });
		}
	}
	return { models: accepted, dropped };
}
