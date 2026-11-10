import { describe, expect, it } from "vite-plus/test";
import { buildMcpServerCard, buildMcpServerInfo } from "./mcp-server-card";

describe("buildMcpServerCard", () => {
	const card = buildMcpServerCard("1.2.3", "https://cv.example.test");

	it("declares a JSON Schema input for every tool", () => {
		for (const tool of card.tools) {
			expect(tool.inputSchema, tool.name).toBeDefined();
			expect(tool.annotations, tool.name).toBeDefined();
			expect(tool.title.length, tool.name).toBeGreaterThan(0);
			// Connector directories reject tools without annotations.title.
			expect(tool.annotations.title, tool.name).toBe(tool.title);
			expect(tool.description.length, tool.name).toBeGreaterThan(0);
		}
	});
});

it("uses the installation's Master CV identity and icons", () => {
	const info = buildMcpServerInfo("1.0.0", "https://cv.example.test/");
	expect(info.title).toBe("Master CV");
	expect(info.websiteUrl).toBe("https://cv.example.test");
	expect(info.icons.map((icon) => icon.src)).toEqual([
		"https://cv.example.test/master-cv/light.svg",
		"https://cv.example.test/master-cv/dark.svg",
	]);
	expect(buildMcpServerCard("1.0.0", "https://cv.example.test").serverInfo).toEqual(info);
});
