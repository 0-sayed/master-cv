import type { UiLocale } from "@reactive-resume/utils/locale";

/** Await the actual UI faces before the first render or a script switch. CV fonts are independent. */
export async function loadUiFonts(locale: UiLocale) {
	const faces =
		locale === "ar-SA"
			? [400, 500, 600].map((weight) => document.fonts.load(`${weight} 16px "Noto Sans Arabic"`, "المعلومات المهنية"))
			: [
					...[400, 500, 600].map((weight) => document.fonts.load(`${weight} 16px "Noto Sans"`, "Career information")),
					document.fonts.load('500 32px "Noto Serif"', "Career information"),
				];
	try {
		await Promise.all(faces);
	} catch {
		// A failed font download must not prevent account access; the browser retains its normal fallback.
		console.warn("UI fonts could not load; using the browser fallback.");
	}
}
