import { afterEach, expect, it, vi } from "vite-plus/test";
import { runDemoSeed } from "./demo-seed.mjs";

const nodeVersion = process.versions.node;
const exitCode = process.exitCode;

afterEach(() => {
	Object.defineProperty(process.versions, "node", { value: nodeVersion });
	process.exitCode = exitCode;
	vi.restoreAllMocks();
});

it("reports the Node 24 requirement before opening the demo database", async () => {
	Object.defineProperty(process.versions, "node", { value: "22.0.0" });
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	await runDemoSeed();
	expect(error).toHaveBeenCalledWith("DEMO_NODE_24_REQUIRED");
	expect(process.exitCode).toBe(1);
});
