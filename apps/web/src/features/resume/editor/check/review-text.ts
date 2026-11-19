import type { ExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import { extractPdf } from "@/features/ats-checker/extract-client";
import { blobToPdfFile } from "@/features/ats-checker/run-ats-check";

const documents = new WeakMap<Blob, Promise<ExtractedDocument>>();
export function reviewText(file: Blob): Promise<ExtractedDocument> {
	let pending = documents.get(file);
	if (!pending) {
		pending = extractPdf(blobToPdfFile(file, "resume.pdf"), { operatorBudgetMs: 0 }).then(async (raw) => {
			const { buildExtractedDocument } = await import("@reactive-resume/resume/ats-pdf");
			return buildExtractedDocument(raw);
		});
		documents.set(file, pending);
		pending.catch(() => documents.delete(file));
	}
	return pending;
}
