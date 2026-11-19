import type { PageMapNode } from "@reactive-resume/pdf/page-map";
import type { ExtractedDocument, PdfEvidence } from "@reactive-resume/resume/ats-pdf";
import type { CSSProperties } from "react";
import { normalizeSectionHeading } from "@reactive-resume/resume/ats";
import { orderTextSpans } from "@reactive-resume/resume/ats-pdf";
import { sameEditorIdentity, type EditorIdentity } from "../store";

export function reviewPdfIsCurrent(
	identity: EditorIdentity | null,
	rendered: { identity?: EditorIdentity | undefined; bytesHash?: string; file?: Blob | undefined },
	result: { state: string; source: (EditorIdentity & { bytesHash?: string }) | null },
): boolean {
	return Boolean(
		identity &&
		rendered.file &&
		rendered.bytesHash &&
		(result.state === "complete" || result.state === "partial") &&
		sameEditorIdentity(identity, rendered.identity) &&
		sameEditorIdentity(identity, result.source) &&
		rendered.bytesHash === result.source?.bytesHash,
	);
}

type Box = NonNullable<PdfEvidence["box"]>;
export type ReviewLocation =
	| { kind: "box"; page: number; box: Box }
	| { kind: "page"; page: number }
	| { kind: "document" };

export function reviewEvidenceLocation(evidence: PdfEvidence | undefined, pageCount: number): ReviewLocation {
	const first = evidence?.locations?.[0];
	const page = evidence?.page ?? first?.page;
	if (!page || !Number.isInteger(page) || page < 1 || page > pageCount) return { kind: "document" };
	const box = evidence?.box ?? first?.box;
	if (!box) return { kind: "page", page };
	if (!Object.values(box).every(Number.isFinite) || box.width <= 0 || box.height <= 0) return { kind: "document" };
	return { kind: "box", page, box };
}

export function reviewEvidenceStyle(box: Box, page: { width: number; height: number }): CSSProperties {
	return {
		left: `${(box.x / page.width) * 100}%`,
		top: `${(box.y / page.height) * 100}%`,
		width: `${(box.width / page.width) * 100}%`,
		height: `${(box.height / page.height) * 100}%`,
	};
}

/** PDF text spans and the renderer's area map both use top-left PDF points. */
export function reviewTextLocation(
	doc: Pick<ExtractedDocument, "lines">,
	text: string,
	area?: PageMapNode,
	page?: number,
): ReviewLocation {
	const needle = normalizeSectionHeading(text).replace(/\s/g, "");
	if (!needle) return area ? { kind: "page", page: area.page + 1 } : { kind: "document" };
	const candidates: { page: number; box: Box }[] = [];
	for (const line of doc.lines) {
		if ((page && line.page !== page) || (area && line.page !== area.page + 1)) continue;
		const ordered = orderTextSpans(line.spans);
		for (let start = 0; start < ordered.length; start++) {
			let value = "";
			const spans = [];
			for (const span of ordered.slice(start)) {
				value += ` ${span.text}`;
				spans.push(span);
				const normalized = normalizeSectionHeading(value).replace(/\s/g, "");
				if (normalized === needle) {
					const x = Math.min(...spans.map((item) => item.x));
					const y = Math.min(...spans.map((item) => item.y));
					const box = {
						x,
						y,
						width: Math.max(...spans.map((item) => item.x + item.width)) - x,
						height: Math.max(...spans.map((item) => item.y + item.height)) - y,
					};
					if (
						!area ||
						(box.x < area.x + area.width &&
							box.x + box.width > area.x &&
							box.y < area.y + area.height &&
							box.y + box.height > area.y)
					)
						candidates.push({ page: line.page, box });
					break;
				}
				if (!needle.startsWith(normalized)) break;
			}
		}
	}
	const [match] = candidates;
	return match && candidates.length === 1
		? { kind: "box", ...match }
		: area
			? { kind: "page", page: area.page + 1 }
			: page
				? { kind: "page", page }
				: { kind: "document" };
}
