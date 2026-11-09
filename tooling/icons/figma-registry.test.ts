import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";

test("every live Figma icon resolves to its exact Phosphor registry export", async () => {
	const manifest = JSON.parse(
		await readFile(new URL("../../Planning/context/design/icons.json", import.meta.url), "utf8"),
	) as {
		icons: Array<{ name: string; nodeId: string; phosphorName?: string }>;
	};
	const source = await readFile(new URL("../../packages/ui/src/components/icon.tsx", import.meta.url), "utf8");
	expect(manifest.icons).toHaveLength(80);
	expect(new Set(manifest.icons.map((icon) => icon.name)).size).toBe(80);
	expect(new Set(manifest.icons.map((icon) => icon.nodeId)).size).toBe(80);
	const names = new Set(
		manifest.icons.flatMap(({ name, phosphorName }) => (phosphorName ? [name, phosphorName] : [name])),
	);
	const missing = [...names].filter((name) => {
		const exported =
			name
				.split("-")
				.map((part) => part[0]?.toUpperCase() + part.slice(1))
				.join("") + "Icon";
		return !new RegExp(`\\n\\t(?:"${name}"|${name}): ${exported},`).test(source);
	});
	expect(missing).toEqual([]);
});
