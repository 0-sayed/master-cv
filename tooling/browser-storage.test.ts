import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
const root = fileURLToPath(new URL("../apps/web/src/", import.meta.url));
function sources(path: string): string[] {
	return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? sources(`${path}/${entry.name}`)
			: /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
				? [`${path}/${entry.name}`]
				: [],
	);
}
it("routes all browser storage through the scope registry", () => {
	const bypasses = sources(root)
		.filter((path) => !path.endsWith("/browser-storage.ts"))
		.filter((path) =>
			/(?:\b(?:localStorage|sessionStorage)\s*\.|\[\s*["'](?:localStorage|sessionStorage)["']\s*\])/.test(
				readFileSync(path, "utf8"),
			),
		);
	expect(bypasses).toEqual([]);
});
