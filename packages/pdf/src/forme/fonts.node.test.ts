import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, it, vi } from "vite-plus/test";
import { getWebFontSource } from "@reactive-resume/fonts";
import { readServerFont } from "./fonts.node";

it("reads all nine pinned Arabic faces offline from the shipped public assets", async () => {
	const manifest = JSON.parse(
		await readFile(
			new URL("../../../../apps/web/public/fonts/noto-sans-arabic/2.009/manifest.json", import.meta.url),
			"utf8",
		),
	);
	const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
	try {
		for (const face of manifest.faces) {
			const source = getWebFontSource("Noto Sans Arabic", face.weight);
			expect(source).toBe(`/fonts/noto-sans-arabic/2.009/${face.file}`);
			if (!source) throw new Error("Pinned font missing from catalog");
			const bytes = await readServerFont(source);
			expect(createHash("sha256").update(bytes).digest("hex")).toBe(face.sha256);
		}
		expect(network).not.toHaveBeenCalled();
		await expect(readServerFont("/fonts/noto-sans-arabic/2.009/missing.ttf")).rejects.toThrow();
	} finally {
		network.mockRestore();
	}
});

it("packages bundled document font files inside the Vercel backend function", async () => {
	const config = JSON.parse(await readFile(new URL("../../../../vercel.json", import.meta.url), "utf8"));
	expect(config.services.backend.functions["vercel.mjs"].includeFiles).toContain("apps/web/dist/fonts/**");
});
