import type { ModelConfig } from "./config";

/** Retained transport fixture only; excluded from the owner-approved study grid. */
export const vertexFixture: ModelConfig = {
	model: "google/gemini-4-hydrogen",
	provider: "google-vertex",
	providerEndpoint: "google-vertex/global",
	reasoning: "low",
	inputPerMillion: 1.5,
	outputPerMillion: 7.5,
	optional: false,
};
