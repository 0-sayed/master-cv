import { pdfImportText } from "@reactive-resume/import/pdf-lines";
import { extractPdf } from "@/features/ats-checker/extract-client";

export { documentToLines } from "@reactive-resume/import/pdf-lines";

export async function extractPdfText(file: File) {
	return pdfImportText(await extractPdf(file, { operatorBudgetMs: 0 }));
}
