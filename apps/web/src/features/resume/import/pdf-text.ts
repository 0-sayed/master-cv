import { pdfImportText } from "@reactive-resume/import/pdf-lines";
import { extractPdf } from "@/features/ats-checker/extract-client";

export { documentToLines } from "@reactive-resume/import/pdf-lines";

export async function extractPdfText(file: File, signal?: AbortSignal) {
	const raw = await extractPdf(file, { operatorBudgetMs: 0, ...(signal ? { signal } : {}) });
	const partial = raw.truncated || Boolean(raw.coverage?.pages.some((page) => page.text !== "complete"));
	return {
		...pdfImportText(raw, { allowPartial: true }),
		partial,
		pages: raw.pages.map((page) => ({ page: page.pageNumber, text: page.items.map((item) => item.str).join(" ") })),
	};
}
