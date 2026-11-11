import type { PreviewPageSize } from "../preview/preview.shared.utils";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { PdfCanvasDocument, PdfCanvasPage } from "../preview/pdf-canvas";
import { DEFAULT_PDF_PAGE_SIZE } from "../preview/preview.shared.utils";

type SourcePreviewProps = { file: File; page: number; onPage: (page: number) => void };
export function SourcePreview({ file, page, onPage }: SourcePreviewProps) {
	const host = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [total, setTotal] = useState(0);
	const [size, setSize] = useState<PreviewPageSize>(DEFAULT_PDF_PAGE_SIZE);
	useEffect(() => {
		const node = host.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<SectionCard aria-label={t`Original PDF`}>
			<SectionCardHeader>
				<h2 className="type-section">
					<Trans>Original PDF</Trans>
				</h2>
			</SectionCardHeader>
			<p className="type-meta wrap-anywhere text-ink-3" dir="auto">
				{file.name}
			</p>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
					<Trans>Previous page</Trans>
				</Button>
				<p className="type-meta" aria-live="polite">
					<Trans>
						Page {page} of {total}
					</Trans>
				</p>
				<Button variant="secondary" disabled={page >= total} onClick={() => onPage(page + 1)}>
					<Trans>Next page</Trans>
				</Button>
			</div>
			<div ref={host} className="min-w-0 overflow-hidden" aria-label={t`PDF preview`}>
				<PdfCanvasDocument file={file} onLoadSuccess={(document) => setTotal(document.numPages)}>
					{(document) => (
						<PdfCanvasPage
							document={document}
							pageNumber={page}
							totalPages={total}
							pageScale={width ? width / size.width : 1}
							pageSize={size}
							onLoadSuccess={(_page, size) => setSize(size)}
							showPageNumbers={false}
						/>
					)}
				</PdfCanvasDocument>
			</div>
		</SectionCard>
	);
}
