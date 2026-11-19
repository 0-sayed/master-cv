import { expect, it } from "vite-plus/test";
import { AI_GUIDE_FEATURES } from "./ai-features";
import { layoutMapNodes, mapBranchPath, mapCardWidths, mapTargetAnchor } from "./map-geometry";

const measuredCard = (bank: "start" | "end", width: number) => ({ bank, width });

it("shares the widest intrinsic card on each side without stretching the other side", () => {
	expect(mapCardWidths([measuredCard("start", 240), measuredCard("start", 280), measuredCard("end", 210)])).toEqual({
		start: 280,
		end: 210,
	});
	expect(mapCardWidths([measuredCard("start", 192), measuredCard("end", 180)])).toEqual({ start: 192, end: 180 });
	expect(mapCardWidths([])).toEqual({ start: 0, end: 0 });
});

it.each([0, 1, 5, 6, 9])("balances %i nodes in target order without mutating the input", (count) => {
	const nodes = Array.from({ length: count }, (_, index) => ({ id: String(index), anchor: 300 - index * 25 }));
	const original = structuredClone(nodes);
	const layout = layoutMapNodes(nodes);
	expect(nodes).toEqual(original);
	expect(layout.map((node) => node.anchor)).toEqual(nodes.map((node) => node.anchor).reverse());
	const start = layout.filter((node) => node.bank === "start");
	const end = layout.filter((node) => node.bank === "end");
	expect(Math.abs(start.length - end.length)).toBeLessThanOrEqual(1);
	for (const bank of [start, end]) {
		const rendered = bank.toSorted((a, b) => a.rowStart - b.rowStart);
		expect(rendered.map((node) => node.anchor)).toEqual(bank.map((node) => node.anchor).toSorted((a, b) => a - b));
	}
});

it("alternates sides and centers the shorter column by half a row", () => {
	expect(
		layoutMapNodes([
			{ id: "last", anchor: 245 },
			{ id: "first", anchor: 83 },
			{ id: "middle", anchor: 172 },
		]),
	).toEqual([
		{ id: "first", anchor: 83, bank: "start", row: 0, rowStart: 1 },
		{ id: "middle", anchor: 172, bank: "end", row: 0, rowStart: 2 },
		{ id: "last", anchor: 245, bank: "start", row: 1, rowStart: 3 },
	]);
});

it.each([false, true])("pins branches to their content rather than card positions (RTL: %s)", (rtl) => {
	for (const left of [false, true]) {
		expect(mapTargetAnchor({ area: "contact", anchor: 83 }, left, rtl)).toEqual({ x: left ? 22 : 222, y: 83 });
		expect(mapTargetAnchor({ area: "sections", anchor: 120 }, left, rtl)).toEqual({ x: left ? 22 : 222, y: 120 });
		expect(mapTargetAnchor({ area: "dates", anchor: 245 }, left, rtl)).toEqual({
			x: (rtl ? [26, 64] : [180, 218])[left ? 0 : 1],
			y: 245,
		});
		expect(mapTargetAnchor({ area: "layout", anchor: 172 }, left, rtl)).toEqual({ x: left ? 0 : 244, y: 172 });
	}
});

it("gives AI tools distinct targets inside their actual text bands or on the document frame", () => {
	const endpoints = AI_GUIDE_FEATURES.map((node) => mapTargetAnchor(node, true, false));
	expect(new Set(endpoints.map(({ x, y }) => `${x}:${y}`)).size).toBe(endpoints.length);
	for (const feature of AI_GUIDE_FEATURES) {
		if (feature.area === "content") {
			expect(feature.anchor).toBeGreaterThanOrEqual(190);
			expect(feature.anchor).toBeLessThanOrEqual(220);
		}
	}
});

it.each([64, 80, 96])("keeps %ipx of horizontal reach before entering the target row on either side", (gap) => {
	for (const direction of [-1, 1]) {
		const card = { x: 400 - gap * direction, y: 50 };
		const edge = { x: 400, y: 150 };
		const target = { x: 400 + 22 * direction, y: 150 };
		const path = mapBranchPath(card, edge, target);
		const points = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
		const coordinate = (index: number) => {
			const value = points[index];
			if (value === undefined) throw new Error("The curve is missing a coordinate");
			return value;
		};
		expect(Math.abs(coordinate(6) - coordinate(0))).toBeGreaterThanOrEqual(64);
		expect(points.slice(-4)).toEqual([edge.x, edge.y, target.x, target.y]);
		// Both tangents are horizontal. The entire bend fits in the reserved gap.
		expect(points[3]).toBe(card.y);
		expect(points[5]).toBe(edge.y);
		for (const x of [coordinate(2), coordinate(4)]) {
			expect(x).toBeGreaterThan(Math.min(card.x, edge.x));
			expect(x).toBeLessThan(Math.max(card.x, edge.x));
		}
	}
});

it.each([1440, 1676, 1920])("keeps AI branches ordered throughout their curves at %ipx", (viewport) => {
	const gap = Math.min(96, Math.max(64, viewport * 0.06));
	const layout = layoutMapNodes(AI_GUIDE_FEATURES);
	for (const bank of ["start", "end"] as const) {
		const nodes = layout.filter((node) => node.bank === bank);
		const left = bank === "start";
		const curves = nodes.map((node, index) => {
			const target = mapTargetAnchor(node, left, false);
			return [
				...mapBranchPath(
					{ x: left ? -gap : 300 + gap, y: index * 140 },
					{ x: left ? 0 : 300, y: (target.y * 300) / 244 },
					{ x: (target.x * 300) / 244, y: (target.y * 300) / 244 },
				).matchAll(/-?\d+(?:\.\d+)?/g),
			].map(([value]) => Number(value));
		});
		// Shared x control points make each sample a common vertical slice through the branches.
		for (let step = 0; step <= 100; step++) {
			const t = step / 100;
			const ys = curves.map((curve) => {
				const [y0, y1, y2, y3] = [curve[1], curve[3], curve[5], curve[7]];
				if (y0 === undefined || y1 === undefined || y2 === undefined || y3 === undefined)
					throw new Error("The branch is missing a curve point");
				return (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3 * y3;
			});
			expect(ys).toEqual(ys.toSorted((a, b) => a - b));
			expect(new Set(ys).size).toBe(ys.length);
		}
	}
});
