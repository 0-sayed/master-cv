import type { ReaderEvidence } from "./types";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { getDocument, version } from "pdfjs-dist/legacy/build/pdf.mjs";
import { documentToLines } from "@reactive-resume/import/pdf-lines";
import { buildExtractedDocument, harvestPdfDocument } from "@reactive-resume/resume/ats-pdf";
import { verifiedPoppler } from "./toolchain";
const execute = promisify(execFile);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
export function extractQualificationPdf(
	bytes: Uint8Array,
	options: { popplerPath?: string } = {},
): Promise<ReaderEvidence[]> {
	const pdfjs = async (): Promise<ReaderEvidence> => {
		const evidence: ReaderEvidence = {
			reader: "pdfjs",
			version,
			options: [
				"disableNormalization=true",
				"includeMarkedContent=false",
				"fontExtraProperties=true",
				"joining=production-geometry",
			],
			text: "",
			status: "failed",
		};
		const task = getDocument({ data: Uint8Array.from(bytes), fontExtraProperties: true });
		try {
			const document = await task.promise;
			const raw = await harvestPdfDocument(document, {
				file: { name: "qualification.pdf", sizeBytes: bytes.length, magicBytesOk: true },
				maxPages: document.numPages,
				operatorBudgetMs: 0,
			});
			if (raw.coverage?.pages.some((page) => page.text !== "complete"))
				return { ...evidence, rawPages: raw.pages, error: "PDF.js text extraction was incomplete" };
			const extracted = buildExtractedDocument(raw);
			// Text items are glyph runs, not words: use the same gap/direction rules as the importer.
			const pages = extracted.pages.map((page) => documentToLines({ ...extracted, pages: [page] }).join("\n"));
			return { ...evidence, status: "complete", text: pages.join("\n\f\n"), pages, rawPages: raw.pages };
		} catch (error) {
			return { ...evidence, error: message(error) };
		} finally {
			await task.destroy();
		}
	};
	const poppler = async (layout: boolean): Promise<ReaderEvidence> => {
		const args = [...(layout ? ["-layout"] : []), "-enc", "UTF-8"];
		const evidence: ReaderEvidence = {
			reader: layout ? "poppler-layout" : "poppler",
			version: "unknown",
			options: args,
			text: "",
			status: "failed",
		};
		let directory: string | undefined;
		try {
			const { binaryPath: executable, env } = await verifiedPoppler(options.popplerPath);
			const info = await execute(executable, ["-v"], { env, timeout: 5000, maxBuffer: 65536 });
			evidence.version = (info.stderr + info.stdout).match(/version\s+(\S+)/)?.[1] ?? "unknown";
			if (evidence.version !== "22.02.0") throw new Error(`Poppler version mismatch: ${evidence.version}`);
			directory = await mkdtemp(join(tmpdir(), "master-cv-qualification-"));
			const path = join(directory, "input.pdf");
			await writeFile(path, bytes);
			const result = await execute(executable, [...args, path, "-"], {
				env,
				timeout: 30000,
				maxBuffer: 16 * 1024 * 1024,
				encoding: "utf8",
			});
			return { ...evidence, status: "complete", text: result.stdout };
		} catch (error) {
			return { ...evidence, error: message(error) };
		} finally {
			if (directory) await rm(directory, { recursive: true, force: true });
		}
	};
	return Promise.all([pdfjs(), poppler(false), poppler(true)]);
}
