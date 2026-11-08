import { expect, it, vi, afterEach } from "vite-plus/test";
import { verifiedPoppler } from "./toolchain";
afterEach(() => vi.unstubAllEnvs());
it.each(["/caller/runtime", ""])(
	"preserves caller runtime library directories after pinned Poppler (%s)",
	async (existing) => {
		vi.stubEnv("LD_LIBRARY_PATH", existing);
		const result = await verifiedPoppler();
		expect(result.env.LD_LIBRARY_PATH).toBe(result.libraryDirectory + (existing ? ":" + existing : ""));
	},
);
