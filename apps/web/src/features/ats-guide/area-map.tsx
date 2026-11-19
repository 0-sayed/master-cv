import type { GuideArea, GuideEntry } from "./model";
import type { IconName } from "@reactive-resume/ui/components/icon";
import type { CSSProperties, ReactNode } from "react";
import { useLingui } from "@lingui/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { guideCopy as copy, guideMapCopy as mapCopy } from "./copy";
import { layoutMapNodes, mapBranchPath, mapCardWidths, mapTargetAnchor } from "./map-geometry";
import { GUIDE_AREAS } from "./model";
import "./area-map.css";

const bands = {
	parseability: { x: 22, y: 104, width: 200, height: 52, rx: 4 },
	layout: { x: 13, y: 13, width: 218, height: 318, rx: 4 },
	sections: { x: 22, y: 112, width: 200, rx: 4 },
	contact: { x: 22, y: 72, width: 200, height: 22, rx: 4 },
	dates: { x: 180, y: 238, width: 38, height: 14, rx: 4 },
	content: { x: 22, y: 190, width: 200, rx: 4 },
} as const;

const highlightTokens = {
	parseability: "--diagram-paper-blue-ink",
	layout: "--diagram-paper-green-ink",
	sections: "--diagram-paper-green-ink",
	contact: "--diagram-paper-gold-ink",
	dates: "--diagram-paper-muted",
	content: "--diagram-paper-green-ink",
} as const satisfies Record<GuideArea, string>;

export function getGuideHighlight(area: GuideArea) {
	const stroke = `var(${highlightTokens[area]})`;
	return { stroke, fill: `color-mix(in srgb, ${stroke} 12%, transparent)` };
}
// Anchors follow the highlighted regions. Whole-document layout uses the page middle.
const anatomy = {
	contact: { icon: "envelope", anchor: 83 },
	sections: { icon: "text-align-left", anchor: 120 },
	content: { icon: "pencil-line", anchor: 205 },
	dates: { icon: "calendar", anchor: 245 },
	parseability: { icon: "text-t", anchor: 130 },
	layout: { icon: "sidebar-simple", anchor: 172 },
} as const;
export type CvMapNode = {
	id: string;
	area: GuideArea;
	icon: IconName;
	anchor: number;
	name: string;
	ariaLabel?: string;
	description: string;
	meta?: ReactNode;
	href?: string;
	location?: string;
	locationNote?: string;
};
type Geometry = {
	width: number;
	height: number;
	trunk: string;
	paths: Record<string, string>;
	traces: Record<string, string>;
	endpoints: Record<string, { card: { x: number; y: number }; target: { x: number; y: number } }>;
};
export function GuideLegend() {
	const { i18n } = useLingui();
	return (
		<div className="guide-map-legend border-t border-line type-metadata text-ink-2">
			<ul className="flex flex-wrap gap-x-6 gap-y-2">
				{(
					[
						["warning-circle", "legendBlocker", "text-danger-text", "blockerHelp"],
						["warning", "legendWarning", "text-warn-text", "warningHelp"],
						["info", "legendTip", "text-info-text", "tipHelp"],
					] as const
				).map(([icon, label, color, help]) => (
					<li key={label} className="flex items-center gap-1.5" title={i18n._(copy[help])}>
						<Icon name={icon} className={color} />
						<span>{i18n._(mapCopy[label])}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function GuideAreaMap({
	entries,
	selected,
	onSelect,
}: {
	entries: readonly GuideEntry[];
	selected: GuideArea | null;
	onSelect: (area: GuideArea) => void;
}) {
	const { _ } = useLingui();
	const nodes = useMemo(
		() =>
			GUIDE_AREAS.filter((area) => entries.some((entry) => entry.area === area)).map((area): CvMapNode => ({
				id: area,
				area,
				...anatomy[area],
				name: _(copy[area]),
				ariaLabel: `${_(copy[area])} ${_({ ...copy.rules, values: { count: entries.filter((entry) => entry.area === area).length } })}`,
				description: _(mapCopy[`${area}Description`]),
				meta: (
					<>
						{(["pdf", "editor"] as const).map((family) => {
							const count = entries.filter((entry) => entry.area === area && entry.source === family).length;
							return count ? (
								<Badge key={family} variant="outline" className="guide-node-count" data-guide-source={family}>
									<Icon name={family === "pdf" ? "file-text" : "database"} />
									<bdi dir="ltr">{count}</bdi>
								</Badge>
							) : null;
						})}
					</>
				),
			})),
		[entries, _],
	);
	return (
		<CvFeatureMap
			nodes={nodes}
			selected={selected}
			onSelect={(id) => onSelect(id as GuideArea)}
			footer={entries.some((entry) => entry.source === "pdf") ? <GuideLegend /> : null}
		/>
	);
}
export function CvFeatureMap({
	nodes: inputNodes,
	title,
	selected = null,
	onSelect,
	footer,
}: {
	nodes: readonly CvMapNode[];
	title?: string;
	selected?: string | null;
	onSelect?: (id: string) => void;
	footer?: ReactNode;
}) {
	const { i18n } = useLingui();
	const id = useId();
	const nodes = useMemo(() => layoutMapNodes(inputNodes), [inputNodes]);
	const stageRef = useRef<HTMLDivElement>(null);
	const [preview, setPreview] = useState<string | null>(null);
	const focused = useRef<string | null>(null);
	const active = preview ?? selected;
	const [geometry, setGeometry] = useState<Geometry | null>(null);
	const rtl = i18n.locale.startsWith("ar");
	const anchors = useMemo(
		() =>
			Object.fromEntries(nodes.map((node) => [node.id, mapTargetAnchor(node, (node.bank === "start") !== rtl, rtl)])),
		[nodes, rtl],
	);
	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		let frame = 0;
		let disposed = false;
		function measure() {
			if (!stage || disposed) return;
			const box = stage.getBoundingClientRect();
			const paper = stage.querySelector(".guide-paper")?.getBoundingClientRect();
			if (!paper?.height || !box.width) return;
			const mobile = getComputedStyle(stage).display === "flex";
			const cards = nodes.flatMap((node) => {
				const element = stage.querySelector<HTMLElement>(`[data-guide-area="${node.id}"]`);
				if (!element) return [];
				element.style.removeProperty("inline-size");
				return [{ bank: node.bank, element }];
			});
			if (!mobile) {
				const widths = mapCardWidths(
					cards.map(({ bank, element }) => ({ bank, width: element.getBoundingClientRect().width })),
				);
				for (const { bank, element } of cards) element.style.inlineSize = `${widths[bank]}px`;
			}
			const centers = nodes.flatMap((node) => {
				const bounds = stage.querySelector(`[data-guide-area="${node.id}"]`)?.getBoundingClientRect();
				return bounds ? [{ ...node, bounds, y: bounds.top + bounds.height / 2 }] : [];
			});
			const trunkX = rtl ? box.width - 8 : 8;
			const rootX = (rtl ? paper.right - 16 : paper.left + 16) - box.left;
			const rootY = paper.bottom - box.top;
			const root = `M ${rootX} ${rootY} C ${rootX} ${rootY + 36}, ${trunkX} ${rootY + 8}, ${trunkX} ${rootY + 56}`;
			const paths: Geometry["paths"] = {};
			const traces: Geometry["traces"] = {};
			const endpoints: Geometry["endpoints"] = {};
			let lastY = rootY;
			for (const { id: area, bounds: node, y: centerY } of centers) {
				const y = centerY - box.top;
				lastY = y;
				if (mobile) {
					const x = (rtl ? node.right : node.left) - box.left;
					const leaf = `Q ${trunkX} ${y}, ${trunkX + (rtl ? -12 : 12)} ${y} L ${x} ${y}`;
					paths[area] = `M ${trunkX} ${y - 24} ${leaf}`;
					traces[area] = `${root} L ${trunkX} ${y - 24} ${leaf}`;
					endpoints[area] = { card: { x, y }, target: { x: trunkX, y: y - 24 } };
				} else {
					const anchor = anchors[area];
					if (anchor === undefined) continue;
					const left = node.left < paper.left;
					const x = (left ? node.right : node.left) - box.left;
					const sy = paper.top + (anchor.y / 344) * paper.height - box.top;
					const card = { x, y };
					const target = { x: paper.left + (anchor.x / 244) * paper.width - box.left, y: sy };
					paths[area] = mapBranchPath(card, { x: (left ? paper.left : paper.right) - box.left, y: sy }, target);
					endpoints[area] = { card, target };
				}
			}
			setGeometry({
				width: box.width,
				height: box.height,
				paths,
				traces,
				endpoints,
				trunk: mobile ? `${root} L ${trunkX} ${lastY}` : "",
			});
		}
		function schedule() {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(measure);
		}
		const observer = new ResizeObserver(schedule);
		observer.observe(stage);
		stage.querySelectorAll("button,a,.guide-paper").forEach((element) => observer.observe(element));
		schedule();
		void document.fonts?.ready.then(schedule);
		return () => {
			disposed = true;
			observer.disconnect();
			cancelAnimationFrame(frame);
		};
	}, [rtl, nodes, anchors]);

	return (
		<SectionCard variant="flush" className="guide-map" aria-label={title ?? i18n._(copy.map)}>
			{title && (
				<SectionCardHeader>
					<h2 className="type-section">{title}</h2>
				</SectionCardHeader>
			)}
			<div
				className="guide-map-stage"
				ref={stageRef}
				style={{ "--guide-map-rows": Math.max(1, Math.ceil(nodes.length / 2)) * 2 } as CSSProperties}
			>
				<svg
					className="guide-map-wires"
					aria-hidden="true"
					viewBox={geometry ? `0 0 ${geometry.width} ${geometry.height}` : undefined}
				>
					<path className="guide-map-trunk" d={geometry?.trunk} />
					{nodes.map((node) => (
						<path
							key={node.id}
							data-guide-tone={node.area}
							data-guide-branch={node.id}
							data-active={active === node.id}
							className="guide-map-wire"
							pathLength="1"
							d={geometry?.paths[node.id]}
						/>
					))}
					{nodes.flatMap((node) =>
						Object.entries(geometry?.endpoints[node.id] ?? {}).map(([end, point]) => (
							<circle
								key={`${node.id}-${end}`}
								data-guide-tone={node.area}
								data-active={active === node.id}
								className="guide-map-card-pin"
								cx={point.x}
								cy={point.y}
								r="3"
							/>
						)),
					)}
					{active && geometry?.traces[active] && (
						<path
							data-guide-tone={nodes.find((node) => node.id === active)?.area}
							data-active="true"
							className="guide-map-wire guide-map-trace"
							d={geometry.traces[active]}
						/>
					)}
				</svg>
				<figure className="guide-paper-wrap" aria-hidden="true">
					<div className="guide-paper">
						<svg viewBox="0 0 244 344" preserveAspectRatio="none" className="guide-paper-drawing">
							<g className="guide-paper-text" direction={rtl ? "rtl" : "ltr"} textAnchor="start">
								<text x={rtl ? 222 : 22} y="42" className="guide-paper-name">
									{i18n._(mapCopy.fullName)}
								</text>
								<text x={rtl ? 222 : 22} y="60">
									{i18n._(mapCopy.jobTitle)}
								</text>
							</g>
							<rect {...bands.layout} data-guide-band="layout" fill="none" />
							<rect {...bands.contact} data-guide-band="contact" className="guide-paper-contact" />
							<g className="guide-paper-contact-lines">
								<path d="M 36 83 H 70 M 84 83 H 124 M 138 83 H 178" />
								<path d="M 200 80 H 210 V 87 H 200 Z M 200 80 L 205 84 L 210 80" />
							</g>
							{(
								[
									["profile", "parseability"],
									["experience", "content"],
									["education", "sections"],
								] as const
							).map(([label, area], index) => (
								<g key={label}>
									<rect
										{...{ ...bands[area], y: [104, 168, 232][index] }}
										data-guide-illustration={area}
										className={`guide-paper-block guide-paper-block-${index}`}
									/>
									<g transform={`translate(${bands[area].x} ${[104, 168, 232][index]})`}>
										<text
											x={rtl ? 194 : 6}
											y="16"
											direction={rtl ? "rtl" : "ltr"}
											textAnchor="start"
											className="guide-paper-section"
										>
											{i18n._(mapCopy[label])}
										</text>
										{index > 0 && <path d={rtl ? "M 6 13 H 40" : "M 160 13 H 194"} className="guide-paper-date" />}
										<g transform={rtl ? "translate(200 0) scale(-1 1)" : undefined} className="guide-paper-lines">
											<path d="M 6 28 H 194 M 6 36 H 166 M 6 44 H 134" />
										</g>
									</g>
								</g>
							))}
							<g className="guide-paper-skills">
								<rect x="98" y="300" width="36" height="8" rx="2" />
								<rect x="142" y="300" width="36" height="8" rx="2" />
								<rect x="186" y="300" width="36" height="8" rx="2" />
							</g>
							<rect
								{...bands.dates}
								x={rtl ? 244 - bands.dates.x - bands.dates.width : bands.dates.x}
								data-guide-band="dates"
								className="guide-paper-date-band"
							/>
							{nodes.map((node) => {
								const area = node.id;
								const band = bands[node.area];
								return (
									<g
										key={area}
										data-guide-tone={node.area}
										style={{ "--paper-tone": getGuideHighlight(node.area).stroke } as CSSProperties}
									>
										<rect
											data-guide-band={node.area}
											data-guide-region={area}
											data-active={active === area}
											className="guide-paper-region"
											style={active === area ? getGuideHighlight(node.area) : undefined}
											{...band}
											x={rtl && node.area === "dates" ? 244 - band.x - band.width : band.x}
										/>
										<circle
											data-guide-pin={area}
											data-active={active === area}
											className="guide-paper-pin"
											cx={anchors[node.id]?.x}
											cy={anchors[node.id]?.y}
											r="3"
										/>
									</g>
								);
							})}
						</svg>
					</div>
					<figcaption className="type-metadata text-ink-3">{i18n._(mapCopy.illustrative)}</figcaption>
				</figure>
				{nodes.map((node) => {
					const control = (
						<Button
							key={node.id}
							data-guide-area={node.id}
							data-guide-tone={node.area}
							data-bank={node.bank}
							style={{ gridRow: `${node.rowStart} / span 2` }}
							data-active={active === node.id}
							variant="secondary"
							size="diagram-node"
							className="guide-map-node"
							render={
								node.href
									? (props) => (
											<a {...props} href={node.href}>
												{props.children}
											</a>
										)
									: undefined
							}
							nativeButton={!node.href}
							aria-pressed={onSelect ? selected === node.id : undefined}
							role={node.href ? "link" : undefined}
							aria-label={node.ariaLabel}
							aria-describedby={`${id}-${node.id}`}
							onClick={() => onSelect?.(node.id)}
							onPointerEnter={(event) => {
								if (event.pointerType !== "touch") setPreview(node.id);
							}}
							onPointerLeave={() => setPreview(focused.current)}
							onFocus={() => {
								focused.current = node.id;
								setPreview(node.id);
							}}
							onBlur={() => {
								focused.current = null;
								setPreview(null);
							}}
						>
							<span className="guide-node-icon">
								<Icon name={node.icon} />
							</span>
							<span className="guide-node-copy">
								<span className="guide-node-name">
									<span>{node.name}</span>
									{node.meta}
								</span>
								<span id={`${id}-${node.id}`} className="guide-node-description type-metadata">
									{node.description}
								</span>
								{node.location && (
									<span className="guide-node-location type-control-compact text-ink-2">
										{node.location.split(/[←→]/).map((segment, index, segments) => (
											<span key={`${index}-${segment}`} className="guide-path-part">
												<span className="guide-path-segment">{segment.trim()}</span>
												{index < segments.length - 1 && <Icon name="caret-right" data-guide-separator />}
											</span>
										))}
									</span>
								)}
							</span>
						</Button>
					);
					return node.locationNote ? (
						<Tooltip key={node.id}>
							<TooltipTrigger render={control} />
							<TooltipContent>{node.locationNote}</TooltipContent>
						</Tooltip>
					) : (
						control
					);
				})}
			</div>
			{footer}
		</SectionCard>
	);
}
