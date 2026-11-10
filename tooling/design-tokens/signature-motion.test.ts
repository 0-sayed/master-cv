import { readFile } from "node:fs/promises";
import { expect, it } from "vite-plus/test";

it("keeps signature animations bounded and free of layout, font, color or filter interpolation", async () => {
	const css = await readFile(new URL("../../packages/ui/src/styles/globals.css", import.meta.url), "utf8");
	for (const token of ["brand-curve", "brand-tick", "brand-total", "acknowledge", "edit-highlight"]) {
		const value = Number(css.match(new RegExp(`--motion-${token}:\\s*(\\d+)ms`))?.[1]);
		expect(value).toBeGreaterThan(0);
		expect(value).toBeLessThanOrEqual(600);
	}
	for (const name of ["brand-approved", "signature-draw", "signature-snap", "brand-tint", "edit-acknowledged"]) {
		const body = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
		expect(body, name).toBeTruthy();
		const properties = [...(body ?? "").matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
		expect(properties.length).toBeGreaterThan(0);
		expect(
			properties.every((property) =>
				["opacity", "transform", "stroke-dasharray", "stroke-dashoffset"].includes(property ?? ""),
			),
		).toBe(true);
	}
});
