import { afterEach, expect, it, vi } from "vite-plus/test";
import { loadUiFonts } from "./ui-fonts";

afterEach(() => vi.unstubAllGlobals());

it("waits for all real Arabic weights before completing", async () => {
	let release = () => {};
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	const requests: string[] = [];
	vi.stubGlobal("document", {
		fonts: {
			load: (face: string) => {
				requests.push(face);
				return pending;
			},
		},
	});
	let complete = false;
	const loading = loadUiFonts("ar-SA").then(() => {
		complete = true;
	});
	await Promise.resolve();
	expect(complete).toBe(false);
	expect(requests).toEqual([
		'400 16px "Noto Sans Arabic"',
		'500 16px "Noto Sans Arabic"',
		'600 16px "Noto Sans Arabic"',
		'400 16px "Noto Sans"',
		'500 16px "Noto Sans"',
		'600 16px "Noto Sans"',
		'500 32px "Noto Serif"',
	]);
	release();
	await loading;
	expect(complete).toBe(true);
});

it("a failed font download preserves account access with the browser fallback", async () => {
	vi.stubGlobal("document", { fonts: { load: () => Promise.reject(new Error("Offline")) } });
	const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
	await expect(loadUiFonts("ar-SA")).resolves.toBeUndefined();
	expect(warning).toHaveBeenCalledWith("UI fonts could not load; using the browser fallback.");
	warning.mockRestore();
});
