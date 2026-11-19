import type { GuideArea } from "./model";

type Point = { x: number; y: number };

/** Each bank shares its widest intrinsic card, within the column's CSS cap. */
export function mapCardWidths(nodes: readonly { bank: "start" | "end"; width: number }[]) {
	return {
		start: Math.max(0, ...nodes.filter((node) => node.bank === "start").map((node) => node.width)),
		end: Math.max(0, ...nodes.filter((node) => node.bank === "end").map((node) => node.width)),
	};
}

/** Target order alternates sides; doubled grid rows center an uneven column. */
export function layoutMapNodes<T extends { anchor: number }>(nodes: readonly T[]) {
	const rows = Math.ceil(nodes.length / 2);
	return nodes
		.toSorted((a, b) => a.anchor - b.anchor)
		.map((node, index) => {
			const bank = index % 2 === 0 ? ("start" as const) : ("end" as const);
			const count = bank === "start" ? rows : Math.floor(nodes.length / 2);
			const row = Math.floor(index / 2);
			return { ...node, bank, row, rowStart: row * 2 + 1 + rows - count };
		});
}

/** Pins belong to the CV content, independently of card height or screen size. */
export function mapTargetAnchor(node: { area: GuideArea; anchor: number }, left: boolean, rtl: boolean): Point {
	const bounds: readonly [number, number] =
		node.area === "layout" ? [0, 244] : node.area === "dates" ? (rtl ? [26, 64] : [180, 218]) : [22, 222];
	return { x: bounds[left ? 0 : 1], y: node.anchor };
}

/** Curves stay outside the paper until their own target row, then enter horizontally. */
export function mapBranchPath(card: Point, edge: Point, target: Point) {
	const gap = edge.x - card.x;
	return `M ${card.x} ${card.y} C ${card.x + gap * 0.45} ${card.y}, ${edge.x - gap * 0.35} ${edge.y}, ${edge.x} ${edge.y} L ${target.x} ${target.y}`;
}
