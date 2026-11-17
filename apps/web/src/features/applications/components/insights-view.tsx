import type { Application } from "../types";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { EmptyState } from "@reactive-resume/ui/components/empty-state";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useSkeletonLoading } from "@reactive-resume/ui/components/skeleton";
import { SkeletonContent } from "@reactive-resume/ui/components/skeleton-content";
import { toast } from "@reactive-resume/ui/components/toast";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { cn } from "@reactive-resume/utils/style";
import { computeInsights, computeOutcomes, computeTimeline } from "../insights";
import { getStageColor, getStageLabel } from "../stages";
import { QuerySkeleton } from "@/components/query-skeleton";
import { stagger } from "@/libs/motion";
import { orpc } from "@/libs/orpc/client";

/** The page's shape while stats load: the funnel, the two figures, then the charts. */
export function InsightsSkeleton() {
	return <SkeletonContent shape="insights" />;
}

export function ApplicationInsights({ applications }: { applications: Application[] }) {
	const { i18n } = useLingui();
	const { data } = useQuery(orpc.applications.stats.queryOptions({}));
	const { data: documents } = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const loading = useSkeletonLoading(!data);

	// A resume is tailored for an application when it was made for it (Copy for a job).
	const madeFor = new Map(
		(documents ?? []).flatMap((document) => (document.application ? [[document.id, document.application.id]] : [])),
	);
	const outcomes = computeOutcomes(applications, (application) =>
		Boolean(application.resumeId && madeFor.get(application.resumeId) === (application as Application).id),
	);

	// Sending history includes applications that later closed, and excludes jobs never sent.
	const timeline = computeTimeline(applications, 8, i18n.locale);
	const maxWeek = Math.max(1, ...timeline.map((bucket) => bucket.count));

	if (loading.pending || !data) return <QuerySkeleton fallback={<InsightsSkeleton />} />;

	const insights = computeInsights(data.byStage);
	const maxSource = Math.max(1, ...data.bySource.map((s) => s.count));
	const widest = Math.max(1, ...outcomes.funnel.map((row) => row.reached));

	if (applications.length < 3) {
		return (
			<EmptyState
				icon="briefcase"
				title={<Trans>Your search is taking shape</Trans>}
				description={
					<Trans>Once you've sent a few applications, this shows how far they get and how quickly people reply.</Trans>
				}
			/>
		);
	}

	return (
		<div className="insights-grid">
			<section
				aria-labelledby="insights-funnel"
				className="grid min-w-0 gap-3 rounded-xl border border-line bg-surface p-5"
			>
				<h2 id="insights-funnel" className="type-body font-semibold">
					<Trans>How far applications get</Trans>
				</h2>
				<ol className="grid gap-2">
					{outcomes.funnel.map((row, index) => (
						<li
							key={row.status}
							className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 type-body"
						>
							<span className="flex items-center gap-1.5 text-ink-2">
								<span
									aria-hidden="true"
									className="size-2 rounded-full"
									style={{ background: getStageColor(row.status) }}
								/>
								{getStageLabel(row.status)}
							</span>
							<span className="h-5 overflow-hidden rounded bg-sunken">
								<span
									className="block h-full origin-left rounded transition-[scale] delay-(--stagger) duration-emphasized ease-enter motion-reduce:delay-0 rtl:origin-right starting:scale-x-0"
									style={{
										...stagger(index),
										width: `${(row.reached / widest) * 100}%`,
										background: getStageColor(row.status),
									}}
								/>
							</span>
							<span className="text-end font-display text-base tabular-nums">{row.reached}</span>
						</li>
					))}
				</ol>
				<p className="type-metadata text-ink-3">
					<Trans>Counts every application that reached each stage, including ones now closed.</Trans>
				</p>
			</section>

			<div className="insights-kpis grid gap-4 sm:grid-cols-2">
				<div className="rounded-xl border border-line p-5">
					<div className="type-title tabular-nums">
						{outcomes.sent ? Math.round((outcomes.heardBack / outcomes.sent) * 100) : 0}%
					</div>
					<div className="type-body text-ink-2">
						<Trans>heard back</Trans>
					</div>
				</div>
				<div className="rounded-xl border border-line p-5">
					<div className="type-title tabular-nums">
						{outcomes.medianDaysToReply === null ? (
							"—"
						) : (
							<span>
								{outcomes.medianDaysToReply} <Trans>days</Trans>
							</span>
						)}
					</div>
					<div className="type-body text-ink-2">
						<Trans>median to first reply</Trans>
					</div>
				</div>
			</div>

			{outcomes.tailored.sent + outcomes.base.sent > 0 && (
				<section
					aria-labelledby="insights-tailored"
					className="insights-wide grid gap-1 rounded-xl border border-line p-5"
				>
					<h2 id="insights-tailored" className="type-body font-semibold">
						<Trans>Tailored vs. base resume</Trans>
					</h2>
					<p className="type-body leading-6 text-ink-2">
						<Trans>
							{outcomes.tailored.replied} of {outcomes.tailored.sent} tailored applications got a reply;{" "}
							{outcomes.base.replied} of {outcomes.base.sent} sent with another resume.
						</Trans>{" "}
						{outcomes.tailored.sent + outcomes.base.sent < 10 && <Trans>Small numbers, but worth noticing.</Trans>}
					</p>
				</section>
			)}

			<PipelineFlow insights={insights} />

			<div className="insights-wide grid gap-4 lg:grid-cols-2">
				{/* application velocity over time */}
				<div className="rounded-xl border border-line p-5">
					<h3 className="type-body font-semibold">
						<Trans>Applications over time</Trans>
					</h3>
					<p className="mt-0.5 type-metadata text-ink-3">
						<Trans>Applications sent per week (last 8 weeks)</Trans>
					</p>
					<div className="mt-4 flex items-end gap-2">
						{timeline.map((bucket, index) => (
							<div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
								<div className="flex h-28 w-full flex-col justify-end">
									<span className="mb-1 text-center type-metadata text-ink-3 tabular-nums">{bucket.count || ""}</span>
									<div
										role="img"
										aria-label={t`${bucket.label}: ${bucket.count} applications`}
										className="w-full origin-bottom rounded-t bg-accent transition-[scale] delay-(--stagger) duration-emphasized ease-enter motion-reduce:delay-0 starting:scale-y-0"
										style={{
											...stagger(index),
											height: `${bucket.count ? Math.max((bucket.count / maxWeek) * 100, 8) : 0}%`,
										}}
									/>
								</div>
								<span
									className={cn(
										"type-metadata whitespace-nowrap text-ink-3 tabular-nums",
										index % 2 === 1 && "max-sm:invisible",
									)}
								>
									{bucket.label}
								</span>
							</div>
						))}
					</div>
				</div>

				{/* sources */}
				<div className="rounded-xl border border-line p-5">
					<h3 className="type-body font-semibold">
						<Trans>Where applications come from</Trans>
					</h3>
					<p className="mt-0.5 type-metadata text-ink-3">
						<Trans>Count by source</Trans>
					</p>
					<div className="mt-4 flex flex-col gap-3">
						{data.bySource.length === 0 ? (
							<EmptyState density="compact" title={<Trans>No source data yet.</Trans>} />
						) : (
							data.bySource.map((row, index) => (
								<div key={row.source} className="flex items-center gap-3 type-metadata">
									<span className="w-28 shrink-0 truncate font-medium">{row.source}</span>
									<div className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
										<div
											className="h-full origin-left rounded-full bg-ink-2 transition-[scale] delay-(--stagger) duration-emphasized ease-enter motion-reduce:delay-0 rtl:origin-right starting:scale-x-0"
											style={{ ...stagger(index), width: `${Math.max((row.count / maxSource) * 100, 3)}%` }}
										/>
									</div>
									<span className="w-6 text-right text-ink-3">{row.count}</span>
								</div>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

const FLOW_FONT = "var(--font-ui)";

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

// A rasterized SVG (loaded as an <img>) can't reach the page's webfonts, so the exported PNG falls
// back to a system font unless the font is inlined. Find the UI woff2 the app already
// loaded (basic-latin subset covers the chart's English labels), base64 it, and return an
// @font-face the export SVG can embed. Returns null on any failure so export still proceeds.
async function uiFontFace(): Promise<string | null> {
	const uiFamily = getComputedStyle(document.documentElement)
		.getPropertyValue("--font-ui")
		.split(",")[0]
		?.trim()
		.replace(/["']/g, "");
	if (!uiFamily) return null;
	const faces: string[] = [];
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList | undefined;
		try {
			rules = sheet.cssRules;
		} catch {
			continue; // cross-origin stylesheet — not readable
		}
		for (const rule of Array.from(rules ?? [])) {
			if (!(rule instanceof CSSFontFaceRule)) continue;
			const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "");
			if (family !== uiFamily) continue;
			if ((rule.style.getPropertyValue("font-style") || "normal") !== "normal") continue;
			// Include each script subset so Arabic labels survive PNG rasterization.

			const url = rule.style.getPropertyValue("src").match(/url\(["']?([^"')]+\.woff2)["']?\)/)?.[1];
			if (!url) continue;
			try {
				const res = await fetch(url);
				if (!res.ok) return null;
				const buffer = await res.arrayBuffer();
				faces.push(
					`@font-face{font-family:"${family}";font-style:normal;font-weight:${rule.style.getPropertyValue("font-weight")};src:url(data:font/woff2;base64,${toBase64(buffer)}) format("woff2");unicode-range:${rule.style.getPropertyValue("unicode-range") || "U+0-10FFFF"};}`,
				);
			} catch {
				return null;
			}
		}
	}
	return faces.join("\n") || null;
}

// A funnel-flow snapshot (the shareable picture). Hand-drawn SVG with inline fills so it exports to
// PNG without any library. Computed theme colors keep the preview and export consistent;
// the "Tracked using Master CV" mark is injected only when exporting.
function PipelineFlow({ insights }: { insights: ReturnType<typeof computeInsights> }) {
	const { i18n } = useLingui();
	const rtl = i18n.locale === "ar-SA";
	const vertical = useBreakpoint() === "mobile";
	const svgRef = useRef<SVGSVGElement>(null);
	const W = vertical ? 320 : 500;
	const H = vertical ? 480 : 340;
	const padX = 40;
	const midY = 190;
	const maxBarH = 150;
	const barW = 34;
	const n = insights.funnel.length;
	const slotW = (W - padX * 2) / n;
	const maxReached = Math.max(1, ...insights.funnel.map((f) => f.reached));

	const bars = insights.funnel.map((f, i) => {
		const h = Math.max((f.reached / maxReached) * maxBarH, 4);
		const x = padX + slotW * (rtl ? n - 1 - i : i) + slotW / 2 - barW / 2;
		const yTop = midY - h / 2;
		return { ...f, color: getStageColor(f.status), x, yTop, h, cx: x + barW / 2 };
	});

	const exportPng = async () => {
		const svg = svgRef.current;
		if (!svg) return;
		// Reveal the export-only watermark on a clone so the on-screen chart stays clean.
		const clone = svg.cloneNode(true) as SVGSVGElement;
		clone.style.fontFamily = getComputedStyle(svg).fontFamily;
		// SVG images cannot resolve page variables. Freeze computed paints for the selected theme.
		const originals = [svg, ...svg.querySelectorAll("*")];
		const copies = [clone, ...clone.querySelectorAll("*")];
		originals.forEach((original, index) => {
			const copy = copies[index];
			if (!(copy instanceof SVGElement)) return;
			const styles = getComputedStyle(original);
			for (const property of ["fill", "stroke", "stop-color", "color", "font-family", "font-size"]) {
				copy.style.setProperty(property, styles.getPropertyValue(property));
			}
		});
		for (const el of clone.querySelectorAll<SVGElement>("[data-export-only]")) el.style.display = "";
		// Serialized SVG images cannot load external resources; include the canonical asset inline.
		const mark = await fetch("/master-cv/dark.svg");
		if (!mark.ok) throw new Error("Could not load the Master CV export mark");
		clone
			.querySelector("image[data-export-only]")
			?.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(await mark.text())}`);
		// Inline the UI font so the rasterized PNG uses the same type as the app.
		const fontFace = await uiFontFace();
		if (fontFace) {
			const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
			styleEl.textContent = fontFace;
			clone.querySelector("defs")?.prepend(styleEl);
		}
		const xml = new XMLSerializer().serializeToString(clone);
		const svg64 = `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(xml).buffer)}`;
		const image = new Image();
		image.onload = () => {
			const scale = 3; // high-resolution output
			const canvas = document.createElement("canvas");
			canvas.width = W * scale;
			canvas.height = H * scale;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.fillStyle = getComputedStyle(svg).backgroundColor;
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			const link = document.createElement("a");
			link.download = "pipeline-flow.png";
			link.href = canvas.toDataURL("image/png");
			link.click();
			toast.add({ type: "success", description: t`Exported pipeline-flow.png` });
		};
		image.src = svg64;
	};

	return (
		<div className="insights-flow min-w-0 rounded-xl border border-line bg-surface p-5">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<h3 className="type-body font-semibold">
					<Trans>Where your applications went</Trans>
				</h3>
				<Button size="sm" variant="secondary" onClick={() => void exportPng()}>
					<Icon name="download-simple" size={16} />
					<Trans>Export PNG</Trans>
				</Button>
			</div>

			<svg
				ref={svgRef}
				viewBox={`0 0 ${W} ${H}`}
				className="mt-3 w-full rounded-xl bg-surface"
				direction={rtl ? "rtl" : "ltr"}
				style={{ fontFamily: FLOW_FONT }}
				role="img"
				aria-label={t`Pipeline flow`}
			>
				<defs>
					{!vertical &&
						bars.slice(0, -1).map((bar, i) => {
							const next = bars[i + 1];
							if (!next) return null;
							return (
								<linearGradient
									key={`grad-${getStageLabel(bar.status)}`}
									id={`flow-grad-${i}`}
									x1={rtl ? "1" : "0"}
									y1="0"
									x2={rtl ? "0" : "1"}
									y2="0"
								>
									<stop offset="0%" stopColor={bar.color} />
									<stop offset="100%" stopColor={next.color} />
								</linearGradient>
							);
						})}
				</defs>

				<rect x={0} y={0} width={W} height={H} rx={16} fill="var(--surface)" />

				<text
					x={rtl ? W - padX : padX}
					textAnchor="start"
					y={40}
					fontSize="var(--type-body-size)"
					fontWeight={700}
					fill="var(--ink)"
				>
					{t`Job search pipeline`}
				</text>
				<text x={rtl ? W - padX : padX} textAnchor="start" y={60} fontSize="var(--type-body-size)" fill="var(--ink-2)">
					{t`${insights.total} active applications`}
				</text>
				{insights.closed > 0 && !vertical && (
					<g>
						<circle cx={rtl ? padX + 96 : W - padX - 96} cy={54} r={4} fill="var(--danger-text)" />
						<text x={rtl ? padX + 86 : W - padX - 86} y={58} fontSize="var(--type-body-size)" fill="var(--ink-2)">
							{t`${insights.closed} closed`}
						</text>
					</g>
				)}

				{/* connecting bands — drawn center-to-center so they pass *behind* the bars (rendered
				    next, on top), leaving a single continuous flow with no seam at each stage. */}
				{!vertical &&
					bars.slice(0, -1).map((bar, i) => {
						const next = bars[i + 1];
						if (!next) return null;
						const x1 = bar.cx;
						const x2 = next.cx;
						const cxa = (x1 + x2) / 2;
						return (
							<path
								key={`band-${getStageLabel(bar.status)}`}
								d={`M${x1},${bar.yTop} C${cxa},${bar.yTop} ${cxa},${next.yTop} ${x2},${next.yTop} L${x2},${next.yTop + next.h} C${cxa},${next.yTop + next.h} ${cxa},${bar.yTop + bar.h} ${x1},${bar.yTop + bar.h} Z`}
								fill={`url(#flow-grad-${i})`}
								opacity={0.32}
							/>
						);
					})}

				{/* bars + labels */}
				{!vertical &&
					bars.map((bar, i) => (
						<g key={`bar-${getStageLabel(bar.status)}`}>
							<rect x={bar.x} y={bar.yTop} width={barW} height={bar.h} rx={6} fill={bar.color} />
							<text
								x={bar.cx}
								y={bar.yTop - 10}
								textAnchor="middle"
								fontSize="var(--type-body-size)"
								fontWeight={700}
								fill="var(--ink)"
							>
								{bar.reached}
							</text>
							<text
								x={bar.cx}
								y={H - 42}
								textAnchor="middle"
								fontSize="var(--type-body-size)"
								fontWeight={500}
								fill="var(--ink-2)"
							>
								{getStageLabel(bar.status)}
							</text>
							{i > 0 && (
								<text x={bar.cx} y={H - 26} textAnchor="middle" fontSize="var(--type-body-size)" fill="var(--ink-2)">
									{bar.conv}
								</text>
							)}
						</g>
					))}
				{vertical &&
					bars.map((bar, i) => {
						const y = 100 + i * 72;
						const cx = rtl ? W - 60 : 60;
						const labelX = rtl ? cx - 32 : cx + 32;
						return (
							<g key={bar.status}>
								{i < bars.length - 1 && (
									<path d={`M${cx},${y + 18} V${y + 54}`} stroke={bar.color} strokeWidth={6} opacity={0.4} />
								)}
								<rect x={cx - 20} y={y - 18} width={40} height={36} rx={6} fill={bar.color} />
								<text
									x={labelX}
									y={y - 1}
									textAnchor="start"
									fontSize="var(--type-body-size)"
									fill="var(--ink)"
									fontWeight={600}
								>
									{getStageLabel(bar.status)}
								</text>
								<text x={labelX} y={y + 20} textAnchor="start" fontSize="var(--type-body-size)" fill="var(--ink-2)">
									{bar.reached}
								</text>
							</g>
						);
					})}

				{/* Embed the approved square mark only in the downloaded chart. */}
				<image
					data-export-only
					style={{ display: "none" }}
					href="/master-cv/dark.svg"
					x={W - 26}
					y={H - 26}
					width={18}
					height={18}
				/>
			</svg>
		</div>
	);
}
