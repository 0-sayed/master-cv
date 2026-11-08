import { readFile } from "node:fs/promises";
import { downloadFont } from "./fonts";

/** Only the versioned font filenames shipped with the web app may be read from disk. */
export async function readServerFont(source: string): Promise<Uint8Array> {
	if (!source.startsWith("/fonts/")) return downloadFont(source);
	if (!/^\/fonts\/noto-sans-arabic\/2\.009\/NotoSansArabic-[A-Za-z]+\.ttf$/.test(source))
		throw new Error(`Unknown bundled font: ${source}`);
	const candidates = [
		new URL(`../../../../apps/web/public${source}`, import.meta.url),
		new URL(`../../web/dist${source}`, import.meta.url),
	];
	for (const candidate of candidates) {
		try {
			return await readFile(candidate);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	throw new Error(`Bundled font unavailable: ${source}`);
}
