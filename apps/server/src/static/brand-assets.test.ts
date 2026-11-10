import { readFile } from "node:fs/promises";
import { expect, test } from "vite-plus/test";
import sharp from "sharp";

const publicRoot = new URL("../../../web/public/", import.meta.url);

test("install icons preserve the approved mark and maskable ink stays inside its safe circle", async () => {
	for (const [name, size, scale] of [
		["pwa-64x64.png", 64, 0.8],
		["pwa-192x192.png", 192, 0.8],
		["pwa-512x512.png", 512, 0.8],
		["apple-touch-icon-180x180.png", 180, 0.8],
		["maskable-icon-512x512.png", 512, 0.64],
	] as const) {
		const icon = await readFile(new URL(name, publicRoot));
		const svg = await readFile(new URL("master-cv/light.svg", publicRoot));
		const markSize = Math.round(size * scale);
		const mark = await sharp(svg).resize(markSize, markSize).png().toBuffer();
		const expected = await sharp({ create: { width: size, height: size, channels: 4, background: "#f1f0eb" } })
			.composite([{ input: mark, left: Math.floor((size - markSize) / 2), top: Math.floor((size - markSize) / 2) }])
			.raw()
			.toBuffer();
		const actual = await sharp(icon).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		expect(actual.info.width, name).toBe(size);
		expect(actual.info.height, name).toBe(size);
		expect(actual.data.equals(expected), name).toBe(true);
		if (name.startsWith("maskable")) {
			for (let y = 0; y < size; y++)
				for (let x = 0; x < size; x++) {
					const offset = (y * size + x) * 4;
					if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4)
						expect([...actual.data.subarray(offset, offset + 3)]).toEqual([241, 240, 235]);
				}
		}
	}
});

test("every ICO size renders the approved square mark", async () => {
	const ico = await readFile(new URL("favicon.ico", publicRoot));
	const svg = await readFile(new URL("master-cv/light.svg", publicRoot));
	expect(ico.readUInt16LE(0)).toBe(0);
	expect(ico.readUInt16LE(2)).toBe(1);
	const sizes = [16, 32, 48, 64, 128, 256];
	expect(ico.readUInt16LE(4)).toBe(sizes.length);
	for (const [i, size] of sizes.entries()) {
		const entry = 6 + i * 16;
		expect(ico[entry] || 256).toBe(size);
		expect(ico[entry + 1] || 256).toBe(size);
		const offset = ico.readUInt32LE(entry + 12);
		const png = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8));
		const actual = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
		expect([actual.info.width, actual.info.height]).toEqual([size, size]);
		expect(actual.data.equals(await sharp(svg).resize(size, size).ensureAlpha().raw().toBuffer())).toBe(true);
	}
});

test("legacy logo URLs also resolve to the approved Master CV mark", async () => {
	for (const theme of ["light", "dark"]) {
		const approved = await readFile(new URL(`master-cv/${theme}.svg`, publicRoot), "utf8");
		for (const family of ["icon", "logo"]) {
			expect(await readFile(new URL(`${family}/${theme}.svg`, publicRoot), "utf8")).toBe(approved);
		}
	}
});
