import type { DateFormat } from "@reactive-resume/schema/resume/dates";
import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useEffect, useRef, useState } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { Button } from "@reactive-resume/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@reactive-resume/ui/components/collapsible";
import { Icon } from "@reactive-resume/ui/components/icon";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { toast } from "@reactive-resume/ui/components/toast";
import { cn } from "@reactive-resume/utils/style";
import { CustomStylesSectionBuilder } from "../-sidebar/right/sections/custom-styles";
import { DesignSectionBuilder } from "../-sidebar/right/sections/design";
import { LayoutSectionBuilder } from "../-sidebar/right/sections/layout";
import { PageSectionBuilder } from "../-sidebar/right/sections/page";
import { TypographySectionBuilder } from "../-sidebar/right/sections/typography";
import {
	replaceResumeFonts,
	useIsResumeLocked,
	useResumeData,
	useResumeStore,
	useUpdateResumeData,
} from "@/features/resume/builder/draft";
import { FontReplacementNotice } from "@/features/resume/editor/design/font-replacement";
import { ColorGroup, PageGroup, TypeGroup } from "@/features/resume/editor/design/style-groups";
import { TemplateGroup } from "@/features/resume/editor/design/template-group";
import { OfflineBanner } from "@/features/resume/editor/save-status";
import { getScrollBehavior } from "@/features/resume/editor/write/reveal";
import { D2 } from "@/libs/motion";
import { getSectionTitle } from "@/libs/resume/section";

const GROUPS = [
	{ id: "template", label: () => t`Template` },
	{ id: "type", label: () => t`Type` },
	{ id: "color", label: () => t`Color` },
	{ id: "page", label: () => t`Page` },
	{ id: "advanced", label: () => t`Advanced` },
] as const;

function Group({ id, title, children }: { id: string; title: ReactNode; children: ReactNode }) {
	return (
		<section id={`design-${id}`} aria-labelledby={`design-${id}-title`} className="grid scroll-mt-14 gap-3 px-4 py-5">
			<h2 id={`design-${id}-title`} className="text-[15px] font-semibold">
				{title}
			</h2>
			{children}
		</section>
	);
}

/**
 * Brings `id` into view. Advanced is collapsed until asked for: jumping into it opens it, then aims again once it
 * has grown (before that its contents aren't mounted and the panel may be too short to bring them to the top).
 * `focus` then moves focus to the target's first control.
 */
let pendingJump: ReturnType<typeof setTimeout> | undefined;

function jumpTo(id: string, advanced: { open: boolean; setOpen: (open: boolean) => void }, focus = false) {
	// A second tab selection cancels the delayed scroll after Advanced expands.
	clearTimeout(pendingJump);
	const aim = () => {
		const target = document.getElementById(id) ?? document.getElementById("design-advanced");
		target?.scrollIntoView({ behavior: getScrollBehavior() });
		if (focus) target?.querySelector<HTMLElement>("input, button, textarea")?.focus({ preventScroll: true });
	};
	if (id.startsWith("design-advanced") && !advanced.open) {
		advanced.setOpen(true);
		pendingJump = setTimeout(aim, D2 * 1000);
	}
	aim();
}

const TYPOGRAPHY_ID = "design-advanced-typography";

/**
 * Design: a sticky nav (Template · Type · Color · Page · Advanced) over groups divided by rules. Presets cover
 * the common choices; Advanced keeps every exact value, custom CSS and the reset.
 */
export function DesignPanel() {
	const locked = useIsResumeLocked();
	const root = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState<string>("template");
	useEffect(() => {
		const element = root.current;
		if (!element) return;
		let scroller: HTMLElement | null = element.parentElement;
		while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
		const target = scroller ?? document.documentElement;
		const update = () => {
			const edge = target.getBoundingClientRect().top + 64;
			const visible = GROUPS.filter((group) => {
				const section = element.querySelector(`#design-${group.id}`);
				return section && section.getBoundingClientRect().top <= edge;
			});
			setActive(visible.at(-1)?.id ?? "template");
		};
		target.addEventListener("scroll", update, { passive: true });
		update();
		return () => target.removeEventListener("scroll", update);
	}, []);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const advanced = { open: advancedOpen, setOpen: setAdvancedOpen };

	return (
		<div ref={root}>
			<Tabs
				className="sticky top-0 z-10 gap-0 bg-surface"
				value={active}
				onValueChange={(value) => {
					setActive(String(value));
					jumpTo(`design-${value}`, advanced);
				}}
			>
				<TabsList variant="line" aria-label={t`Design groups`} className="w-full justify-between bg-surface px-3">
					{GROUPS.map((group) => (
						<TabsTrigger key={group.id} value={group.id} aria-controls={`design-${group.id}`}>
							{group.label()}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<fieldset disabled={locked} className="m-0 min-w-0 divide-y divide-line border-0 p-0">
				<Group id="template" title={<Trans>Template</Trans>}>
					<TemplateGroup />
				</Group>
				<Group id="type" title={<Trans>Type</Trans>}>
					<FontReplacement />
					<TypeGroup onCustomFonts={() => jumpTo(TYPOGRAPHY_ID, advanced, true)} />
				</Group>
				<Group id="color" title={<Trans>Color</Trans>}>
					<ColorGroup />
				</Group>
				<Group id="page" title={<Trans>Page</Trans>}>
					<PageGroup />
				</Group>
				<AdvancedGroup open={advancedOpen} onOpenChange={setAdvancedOpen} />
			</fieldset>
		</div>
	);
}

type SheetTab = "template" | "type" | "color" | "page" | "advanced";

/**
 * Phones: Design is a sheet over the lower half of the page, so every change shows above it. The handle
 * raises it to full height. It keeps its full height and moves by `translate` (half out of view when lowered),
 * and rises into view when Design opens. Tabs replace the group nav.
 */
export function DesignSheet() {
	const locked = useIsResumeLocked();
	const [tab, setTab] = useState<SheetTab>("template");
	const [expanded, setExpanded] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	return (
		<section
			aria-label={t`Design`}
			className={cn(
				"[container-type:size] absolute inset-x-0 bottom-0 z-20 flex h-[calc(100%-1rem)] flex-col rounded-t-2xl border-t border-line bg-surface shadow-e3 transition-[translate] duration-emphasized ease-enter starting:translate-y-full",
				!expanded && "translate-y-[calc(50%-0.5rem)]",
			)}
		>
			<button
				type="button"
				aria-expanded={expanded}
				aria-label={expanded ? t`Lower the design sheet` : t`Raise the design sheet`}
				onClick={() => setExpanded(!expanded)}
				className="flex h-6 shrink-0 items-center justify-center"
			>
				<span className="h-1 w-9 rounded-full bg-line-2" />
			</button>

			<Tabs
				value={tab}
				onValueChange={(value) => {
					setTab(value as SheetTab);
					if (value === "advanced") setAdvancedOpen(true);
				}}
				className="min-h-0 flex-1 gap-0"
			>
				<TabsList variant="line" className="w-full shrink-0 justify-around px-4">
					{GROUPS.map((group) => (
						<TabsTrigger key={group.id} value={group.id}>
							{group.label()}
						</TabsTrigger>
					))}
				</TabsList>

				<fieldset disabled={locked} className="m-0 min-h-0 min-w-0 flex-1 overflow-y-auto border-0 p-4">
					<TabsContent value={tab}>
						<OfflineBanner className="mb-4" />
						<FontReplacement />
						{tab === "template" && <TemplateGroup layout="strip" />}
						{tab === "type" && (
							<>
								<TypeGroup
									onCustomFonts={() => {
										// The new tab mounts these controls before the delayed focus runs.
										setTab("advanced");
										jumpTo(TYPOGRAPHY_ID, { open: false, setOpen: setAdvancedOpen }, true);
									}}
								/>
							</>
						)}
						{tab === "color" && <ColorGroup />}
						{tab === "page" && (
							<div className="-mx-4 divide-y divide-line">
								<div className="px-4 pb-5">
									<PageGroup />
								</div>
							</div>
						)}
						{/* Lowered, the sheet's lower half is out of view: this keeps the end of the list scrollable into sight. */}
						{!expanded && <div aria-hidden="true" className="h-[calc(50cqh-0.5rem)]" />}
						{tab === "advanced" && <AdvancedGroup open={advancedOpen} onOpenChange={setAdvancedOpen} />}
					</TabsContent>
				</fieldset>
			</Tabs>
		</section>
	);
}

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
	{ value: "short", label: "Mar 2022" },
	{ value: "long", label: "March 2022" },
	{ value: "numeric", label: "03/2022" },
	{ value: "iso", label: "2022-03" },
];

// The exact-value editors, each under its own heading. They mount only while Advanced is open.
const EXACT_SECTIONS = [
	["typography", TypographySectionBuilder],
	["design", DesignSectionBuilder],
	["page", PageSectionBuilder],
	["layout", LayoutSectionBuilder],
	["styles", CustomStylesSectionBuilder],
] as const;

/** Every exact value, the date format, custom CSS and Reset design defaults, collapsed until asked for. */
// Controlled so the nav and Type's Custom row can open it.
type AdvancedGroupProps = { open: boolean; onOpenChange: (open: boolean) => void };

function AdvancedGroup({ open, onOpenChange }: AdvancedGroupProps) {
	const data = useResumeData();
	const updateResumeData = useUpdateResumeData();

	const reset = () => {
		updateResumeData(
			(draft) => {
				const defaults = defaultResumeData.metadata;
				draft.metadata.typography = structuredClone(defaults.typography);
				draft.metadata.design = structuredClone(defaults.design);
				draft.metadata.layout.sidebarWidth = defaults.layout.sidebarWidth;
				// Paper, language, date format, section placement and custom CSS are the user's, not the look's; they stay.
				const { gapX, gapY, marginX, marginY, hideIcons, hideLinkUnderline, hideSectionIcons } = defaults.page;
				Object.assign(draft.metadata.page, {
					gapX,
					gapY,
					marginX,
					marginY,
					hideIcons,
					hideLinkUnderline,
					hideSectionIcons,
				});
			},
			{ newStep: true },
		);
		toast.add({
			description: t`Design reset to defaults`,
			actionProps: { children: t`Undo`, onClick: () => useResumeStore.getState().undo() },
		});
	};

	return (
		<Collapsible
			id="design-advanced"
			open={open}
			onOpenChange={onOpenChange}
			className="scroll-mt-14 px-4 py-5 lg:min-h-[calc(100svh-var(--editor-bar)-var(--space-64))]"
		>
			<CollapsibleTrigger className="group/advanced flex w-full cursor-pointer items-center justify-between text-start text-[15px] font-semibold">
				<Trans>Advanced</Trans>
				<Icon
					name="caret-down"
					className="text-ink-2 transition-transform duration-standard ease-enter group-data-panel-open/advanced:rotate-180"
				/>
			</CollapsibleTrigger>

			<CollapsibleContent>
				<div className="@container grid gap-6 pt-4">
					<div className="grid gap-1.5">
						<label htmlFor="design-date-format" className="text-[13px] font-medium">
							<Trans>Date format</Trans>
						</label>
						<NativeSelect
							id="design-date-format"
							value={data?.metadata.page.dateFormat ?? "short"}
							onChange={(event) =>
								updateResumeData(
									(draft) => {
										draft.metadata.page.dateFormat = event.target.value as DateFormat;
									},
									{ newStep: true },
								)
							}
						>
							{DATE_FORMATS.map((format) => (
								<option key={format.value} value={format.value}>
									{format.label}
								</option>
							))}
						</NativeSelect>
					</div>

					{EXACT_SECTIONS.map(([type, Section]) => (
						<section
							key={type}
							id={`design-advanced-${type}`}
							aria-labelledby={`design-advanced-${type}-title`}
							className="grid scroll-mt-14 gap-3"
						>
							<h3 id={`design-advanced-${type}-title`} className="text-[13px] font-semibold text-ink-2">
								{getSectionTitle(type)}
							</h3>
							<Section />
						</section>
					))}

					<Button variant="secondary" className="w-fit" onClick={reset}>
						<Icon name="arrow-counter-clockwise" size={18} />
						<Trans>Reset design defaults</Trans>
					</Button>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function FontReplacement() {
	const data = useResumeData();
	if (!data) return null;
	return (
		<FontReplacementNotice
			data={data}
			onAccept={(before, after) => {
				if (!replaceResumeFonts(before, after)) return;
				const accepted = useResumeStore.getState().resume?.data;
				toast.add({
					description: t`Document font changed`,
					actionProps: {
						children: t`Undo`,
						onClick: () => {
							const latest = useResumeStore.getState();
							if (latest.resume?.data === accepted) latest.undo();
						},
					},
				});
			}}
		/>
	);
}
