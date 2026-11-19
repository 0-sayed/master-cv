import type { GuideArea, GuideCode, GuideEntry, GuideFilter } from "./model";
import { useLingui } from "@lingui/react";
import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertActions, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { SectionCard, SectionCardBody, SectionCardHeader } from "@reactive-resume/ui/components/section-card";
import { Skeleton } from "@reactive-resume/ui/components/skeleton";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { AI_GUIDE_FEATURES } from "./ai-features";
import { AiGuideMap } from "./ai-map";
import { GuideAreaMap, GuideLegend } from "./area-map";
import { guideCopy as copy } from "./copy";
import { reviewGuideSearch, type ReviewGuideTab } from "./links";
import { filterGuideEntries, findGuideEntry, GUIDE_AREAS, guideRuleId } from "./model";
import { GuideRuleList } from "./rule-list";
import { PageHeader } from "@/components/layout/page-header";
import { reviewTabs } from "@/features/resume/editor/check/review-tabs";
import { SeverityFilter } from "@/features/review/severity-filter";

export function AtsGuidePage({ entries }: { entries: readonly GuideEntry[] }) {
	const { i18n } = useLingui();
	const router = useRouter();
	const location = useLocation();
	const search = reviewGuideSearch(location.search);
	const rule = location.hash || (search.rule ? `rule-${search.rule.replace(/^rule-/, "")}` : "");
	const entry = findGuideEntry(entries, rule);
	const tab = entry ? (entry.source === "pdf" ? "ats" : "data") : (search.tab ?? "ats");
	useEffect(() => {
		if (search.tab !== tab)
			void router.navigate({
				search: { ...location.search, tab },
				hash: location.hash,
				replace: true,
				resetScroll: false,
				hashScrollIntoView: false,
			});
	}, [router, search.tab, tab, location.hash, location.search]);
	const visible = entries.filter((entry) => entry.source === (tab === "data" ? "editor" : "pdf"));
	const counts = {
		ats: entries.filter((entry) => entry.source === "pdf").length,
		data: entries.filter((entry) => entry.source === "editor").length,
		ai: AI_GUIDE_FEATURES.length,
	};
	return (
		<>
			<PageHeader title={i18n._(copy.title)} />
			<Tabs
				value={tab}
				onValueChange={(value) => {
					void router.navigate({
						search: { ...location.search, tab: value as ReviewGuideTab, rule: undefined },
						hash: "",
						resetScroll: false,
					});
				}}
			>
				<TabsList className="self-center" size="page" aria-label={i18n._(copy.title)}>
					{reviewTabs.map((item) => (
						<TabsTrigger
							key={item.id}
							value={item.id}
							aria-label={i18n._(item.label)}
							aria-describedby={`guide-count-${item.id}`}
						>
							<Icon name={item.icon} />
							<span className="hidden sm:inline">{i18n._(item.label)}</span>
							<span className="sm:hidden">{i18n._(copy[`${item.id}Short`])}</span>
							<TabsCount id={`guide-count-${item.id}`}>
								<bdi dir="ltr">{counts[item.id]}</bdi>
							</TabsCount>
						</TabsTrigger>
					))}
				</TabsList>
				{tab !== "ai" && (
					<p id="review-guide-description" className="text-center type-body text-ink-2">
						{i18n._(copy[`${tab}Description`])}
					</p>
				)}
				<TabsContent value={tab} aria-describedby="review-guide-description" className="grid gap-4">
					{tab === "ai" ? <AiGuideMap /> : <GuideRulesPage key={tab} entries={visible} rule={rule} />}
				</TabsContent>
			</Tabs>
		</>
	);
}
function GuideRulesPage({ entries, rule }: { entries: readonly GuideEntry[]; rule: string }) {
	const { i18n } = useLingui();
	const router = useRouter();
	const location = useLocation();
	const [area, setArea] = useState<GuideArea | null>(null);
	const [query, setQuery] = useState("");
	const [type, setType] = useState<GuideFilter>("all");
	const [openCodes, setOpenCodes] = useState<ReadonlySet<GuideCode>>(new Set());
	const source = entries[0]?.source ?? "pdf";
	const [table, setTable] = useState(false);
	const [invalid, setInvalid] = useState(false);
	const [focusCode, setFocusCode] = useState<{ code: GuideCode } | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const heading = useRef<HTMLHeadingElement>(null);
	const origin = useRef<HTMLElement | null>(null);
	const clearHash = useCallback(() => {
		if (router.state.location.hash || reviewGuideSearch(router.state.location.search).rule)
			void router.navigate({
				hash: "",
				search: { ...router.state.location.search, rule: undefined },
				replace: true,
				resetScroll: false,
				hashScrollIntoView: false,
			});
	}, [router]);
	const reset = useCallback(() => {
		setArea(null);
		setQuery("");
		setType("all");
		setOpenCodes(new Set());
		setInvalid(false);
		setFocusCode(null);
		clearHash();
		(origin.current?.isConnected ? origin.current : searchRef.current)?.focus({ preventScroll: true });
	}, [clearHash]);
	const locationKey = `${location.href}:${location.state.__TSR_key ?? ""}`;
	const [appliedLocation, setAppliedLocation] = useState<string | null>(null);
	if (appliedLocation !== locationKey) {
		setAppliedLocation(locationKey);
		const entry = findGuideEntry(entries, rule);
		setInvalid(Boolean(rule) && !entry);
		if (rule) {
			setArea(entry?.area ?? null);
			setQuery("");
			setType("all");
			setOpenCodes(new Set(entry ? [entry.code] : []));
			setFocusCode(entry ? { code: entry.code } : null);
		}
	}
	useEffect(() => {
		if (!focusCode) return;
		const summary = document.getElementById(guideRuleId(focusCode.code))?.querySelector("summary");
		if (!summary) return;
		summary.scrollIntoView?.({ block: "nearest", behavior: "instant" });
		summary.focus({ preventScroll: true });
	}, [focusCode, area, query, type]);
	const active = area !== null || query.trim() !== "" || type !== "all";
	useEffect(() => {
		const escape = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented || !active) return;
			if (
				document.querySelector(
					'[role="dialog"],dialog[open],[role="menu"],[role="listbox"],[data-slot="dialog-popup"],[data-slot="dropdown-menu-content"]',
				)
			)
				return;
			event.preventDefault();
			reset();
		};
		document.addEventListener("keydown", escape);
		return () => document.removeEventListener("keydown", escape);
	}, [active, reset]);
	const filtered = filterGuideEntries(entries, { area, query, type, source });
	function selectArea(value: GuideArea) {
		origin.current =
			document.activeElement instanceof HTMLElement && document.activeElement !== document.body
				? document.activeElement
				: document.querySelector<HTMLElement>(`[data-guide-area="${value}"]`);
		setArea(value);
		setInvalid(false);
		setOpenCodes(new Set());
		setFocusCode(null);
		clearHash();
		requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
	}
	function toggle(code: GuideCode, open: boolean) {
		setOpenCodes((previous) => {
			const next = new Set(previous);
			if (open) next.add(code);
			else next.delete(code);
			return next;
		});
		if (open && router.state.location.hash === guideRuleId(code)) setFocusCode({ code });
	}
	return (
		<>
			<div className="flex justify-end">
				<Button variant="secondary" aria-pressed={table} onClick={() => setTable(!table)}>
					{i18n._(table ? copy.showMap : copy.showTable)}
				</Button>
			</div>
			{table ? (
				<SectionCard className="shrink-0">
					<div className="overflow-x-auto overflow-y-hidden">
						<table className="w-full text-start type-body">
							<caption className="text-start type-section">{i18n._(copy.caption)}</caption>
							<thead>
								<tr>
									<th scope="col" className="py-3 text-start">
										{i18n._(copy.area)}
									</th>
									<th scope="col" className="py-3 text-start">
										{i18n._(copy[source])}
									</th>
								</tr>
							</thead>
							<tbody>
								{GUIDE_AREAS.map((value) => (
									<tr key={value} className="border-t border-line">
										<th scope="row" className="text-start">
											<button
												type="button"
												className="data-table-header-action touch-target"
												data-guide-area={value}
												onClick={() => selectArea(value)}
											>
												{i18n._(copy[value])}
											</button>
										</th>
										<td className="py-3 text-start tabular-nums">
											<bdi dir="ltr">{entries.filter((entry) => entry.area === value).length}</bdi>
										</td>
									</tr>
								))}
							</tbody>
							<tfoot className="border-t border-line bg-sunken type-label text-ink">
								<tr>
									<th scope="row" className="p-3 text-start">
										{i18n._(copy.total)}
									</th>
									<td className="py-3 text-start tabular-nums">
										<bdi dir="ltr">{entries.length}</bdi>
									</td>
								</tr>
							</tfoot>
						</table>
					</div>
					{source === "pdf" && <GuideLegend />}
				</SectionCard>
			) : (
				<GuideAreaMap entries={entries} selected={area} onSelect={selectArea} />
			)}
			<div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
				<label className="grid gap-2 type-label" htmlFor="ats-guide-search">
					{i18n._(copy.search)}
					<Input
						id="ats-guide-search"
						type="search"
						ref={searchRef}
						value={query}
						onChange={(event) => {
							origin.current = searchRef.current;
							setQuery(event.target.value);
							setInvalid(false);
							setOpenCodes(new Set());
							setFocusCode(null);
							clearHash();
						}}
					/>
				</label>
				<SeverityFilter
					label={i18n._(copy.filter)}
					value={type === "editor" ? "all" : type}
					onChange={(value) => {
						origin.current = searchRef.current;
						setFocusCode(null);
						setType(value);
						setInvalid(false);
						clearHash();
					}}
					counts={{
						blocker: entries.filter((entry) => entry.severity === "blocker").length,
						warning: entries.filter((entry) => entry.severity === "warning" || entry.severity === "error").length,
						tip: entries.filter((entry) => entry.severity === "tip" || entry.severity === "info").length,
					}}
				/>
			</div>
			{invalid && (
				<Alert variant="error">
					<Icon name="warning-circle" />
					<AlertTitle>{i18n._(copy.unknown)}</AlertTitle>
					<AlertDescription>{i18n._(copy.unknownHelp)}</AlertDescription>
					<AlertActions>
						<Button variant="secondary" onClick={reset}>
							{i18n._(copy.clearFilters)}
						</Button>
					</AlertActions>
				</Alert>
			)}
			<SectionCard variant="flush" aria-labelledby="ats-guide-results">
				<SectionCardHeader className="flex-wrap justify-between">
					<div>
						<h2 id="ats-guide-results" tabIndex={-1} ref={heading} className="type-section">
							{i18n._({ ...copy.results, values: { area: i18n._(area ? copy[area] : copy.allAreas) } })}
						</h2>
						<p role="status" className="type-caption text-ink-3">
							{i18n._({ ...copy.rules, values: { count: filtered.length } })}
						</p>
					</div>
					{area && (
						<Button
							variant="secondary"
							size="chip"
							onClick={() => {
								setArea(null);
								setOpenCodes(new Set());
								setFocusCode(null);
								clearHash();
								heading.current?.focus({ preventScroll: true });
							}}
						>
							{i18n._({ ...copy.showing, values: { area: i18n._(copy[area]) } })}
							<Icon name="x" />
						</Button>
					)}
				</SectionCardHeader>
				{filtered.length ? (
					<GuideRuleList entries={filtered} openCodes={openCodes} onToggle={toggle} />
				) : (
					<SectionCardBody>
						<h3 className="type-section">{i18n._(copy.empty)}</h3>
						<p className="text-ink-2">{i18n._(copy.emptyHelp)}</p>
						<Button variant="secondary" onClick={reset}>
							{i18n._(copy.clearFilters)}
						</Button>
					</SectionCardBody>
				)}
			</SectionCard>
		</>
	);
}
export function AtsGuidePending() {
	const { i18n } = useLingui();
	return (
		<div role="status" className="grid gap-4">
			<p>{i18n._(copy.loading)}</p>
			<Skeleton className="h-48 w-full" />
		</div>
	);
}
export function AtsGuideError() {
	const { i18n } = useLingui();
	const router = useRouter();
	const [retrying, setRetrying] = useState(false);
	return (
		<Alert variant="error">
			<Icon name="warning-circle" />
			<AlertTitle>{i18n._(copy.error)}</AlertTitle>
			<AlertDescription>{i18n._(copy.retryHelp)}</AlertDescription>
			<AlertActions>
				<Button
					variant="secondary"
					loading={retrying}
					onClick={async () => {
						setRetrying(true);
						try {
							await router.invalidate();
						} finally {
							setRetrying(false);
						}
					}}
				>
					{i18n._(copy.retry)}
				</Button>
			</AlertActions>
		</Alert>
	);
}
