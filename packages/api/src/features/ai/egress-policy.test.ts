import { expect, it, vi } from "vite-plus/test";
import { getModel, getAgentModel, testConnection } from "./service";

it("denies legacy model construction and credential probes before any outbound call", async () => {
	const fetch = vi.spyOn(globalThis, "fetch");
	try {
		const input = {
			provider: "openai" as const,
			model: "synthetic",
			apiKey: "synthetic",
			baseURL: "https://api.openai.com/v1",
		};
		expect(() => getModel(input)).toThrow();
		expect(() => getAgentModel(input)).toThrow();
		await expect(testConnection(input)).rejects.toMatchObject({ data: { reason: "AI_NOT_ENABLED" } });
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		fetch.mockRestore();
	}
});
