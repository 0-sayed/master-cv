import type { PageMap, PageMapTarget } from "@reactive-resume/pdf/page-map";

/** Screen-only tint over exact semantic PDF regions; never participates in PDF rendering. */
export function EditHighlights({
	pageIndex,
	pageMap,
	targets,
}: {
	pageIndex: number;
	pageMap: PageMap | undefined;
	targets: PageMapTarget[];
}) {
	const page = pageMap?.pages[pageIndex];
	if (!page || !pageMap || page.width <= 0 || page.height <= 0) return null;
	return (
		<div aria-hidden="true" className="pointer-events-none absolute inset-0">
			{pageMap.nodes
				.filter(
					(node) =>
						node.page === pageIndex &&
						targets.some((target) =>
							target.kind === "header"
								? node.kind === "header"
								: node.kind === "section" && node.sectionId === target.sectionId,
						),
				)
				.map((node) => (
					<span
						key={node.key}
						data-slot="preview-edit-highlight"
						data-section-id={node.kind === "header" ? "header" : node.sectionId}
						className="preview-edit-highlight"
						style={{
							left: `${(node.x / page.width) * 100}%`,
							top: `${(node.y / page.height) * 100}%`,
							width: `${(node.width / page.width) * 100}%`,
							height: `${(node.height / page.height) * 100}%`,
						}}
					/>
				))}
		</div>
	);
}
