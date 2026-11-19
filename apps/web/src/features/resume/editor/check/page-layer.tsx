import type { PageMap, PageMapTarget } from "@reactive-resume/pdf/page-map";
import type { ExtractedDocument } from "@reactive-resume/resume/ats-pdf";
import { useEffect, useState } from "react";
import { isSameSelection, sameEditorIdentity, useEditorStore } from "../store";
import { scrollToIssue } from "./actions";
import { pdfFindingKey, pdfFieldTarget } from "./pdf-findings";
import { reviewEvidenceLocation, reviewEvidenceStyle, reviewPdfIsCurrent, reviewTextLocation } from "./review-location";
import { reviewText } from "./review-text";
import { useCheck } from "./use-check";
import { useReadiness } from "./use-readiness";

type Marker = {
	key: string;
	box: { x: number; y: number; width: number; height: number };
};

export function CheckPageLayer({ pageIndex, pageMap }: { pageIndex: number; pageMap: PageMap | undefined }) {
	const check = useCheck();
	const tab = useEditorStore((state) => state.reviewTab);
	const filter = useEditorStore((state) => state.reviewFilters[tab]);
	const selected = useEditorStore((state) => state.checkIssue);
	const identity = useEditorStore((state) => state.identity);
	const rendered = useEditorStore((state) => state.rendered);
	const { results, pdfReport } = useReadiness();
	const [parsed, setParsed] = useState<{ file: Blob; doc: ExtractedDocument } | null>(null);
	useEffect(() => {
		let cancelled = false;
		if (!selected || !rendered.file || !sameEditorIdentity(identity, rendered.identity)) return;
		const file = rendered.file;
		void reviewText(file)
			.then((doc) => {
				if (!cancelled) setParsed({ file, doc });
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [selected, rendered.file, rendered.identity, identity]);
	useEffect(() => {
		if (selected && parsed?.file === rendered.file) scrollToIssue(selected, "page");
	}, [selected, parsed, rendered.file]);
	const doc = parsed && parsed.file === rendered.file ? parsed.doc : undefined;
	const page = pageMap?.pages[pageIndex];
	if (
		!selected ||
		!check ||
		!pageMap ||
		!page ||
		page.width <= 0 ||
		page.height <= 0 ||
		pageMap !== rendered.pageMap ||
		!sameEditorIdentity(identity, rendered.identity) ||
		!rendered.file
	)
		return null;
	let markers: Marker[] = [];
	if (tab === "ats" && reviewPdfIsCurrent(identity, rendered, results.pdf)) {
		markers = [...(pdfReport?.findings ?? []), ...(pdfReport?.tips ?? [])]
			.filter((finding) => !check.data.metadata.check?.ignored.includes(pdfFindingKey(finding)))
			.flatMap((finding) => {
				const target = pdfFieldTarget(finding.code);
				const area = target ? pageMap.nodes.find((node) => isSameSelection(node as PageMapTarget, target)) : undefined;
				const evidence = finding.evidence?.locations?.length ? finding.evidence.locations : [finding.evidence];
				return evidence.flatMap((item) => {
					let location = reviewEvidenceLocation(item, pageMap.pages.length);
					if (doc && location.kind !== "box" && item?.snippet)
						location = reviewTextLocation(
							doc,
							item.snippet,
							area && (!item.page || area.page === item.page - 1) ? area : undefined,
							item.page,
						);
					if (location.kind !== "box" && area) location = { kind: "box", page: area.page + 1, box: area };
					return location.kind === "box" &&
						location.page === pageIndex + 1 &&
						(filter === "all" || filter === finding.severity)
						? [
								{
									key: pdfFindingKey(finding),
									box: location.box,
								},
							]
						: [];
				});
			});
	} else if (
		tab === "writing" &&
		(results.writing.state === "complete" || results.writing.state === "partial") &&
		sameEditorIdentity(identity, results.writing.source)
	) {
		markers = check.issues.flatMap((issue) => {
			const node = issue.target
				? pageMap.nodes.find((node) => isSameSelection(node as PageMapTarget, issue.target))
				: undefined;
			const value = String(issue.finding.params?.title ?? issue.finding.params?.value ?? "");
			const location = doc && value ? reviewTextLocation(doc, value, node) : undefined;
			const box = location?.kind === "box" ? location.box : node;
			const severity = issue.finding.severity === "info" ? "tip" : "warning";
			return node && box && node.page === pageIndex && (filter === "all" || filter === severity)
				? [{ key: issue.key, box }]
				: [];
		});
	}
	markers = markers.filter((marker) => marker.key === selected);
	if (!markers.length) return null;
	return (
		<div data-slot="check-page-layer" className="pointer-events-none absolute inset-0">
			{markers.map((marker) => (
				<div
					key={`${marker.key}:${marker.box.x}:${marker.box.y}`}
					data-issue-pin={marker.key}
					data-selected
					style={reviewEvidenceStyle(marker.box, page)}
					className="absolute border border-accent bg-accent-soft/20"
				/>
			))}
		</div>
	);
}
