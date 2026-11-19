import type { ComponentProps, ReactNode } from "react";
import { useDirection } from "@base-ui/react/direction-provider";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Icon } from "./icon";
import { IconButton } from "./icon-button";
import { useUiLabels } from "./ui-labels";
import "./editor-panel.css";

const PANEL_MIN = 360;
const PREVIEW_MIN = 480;
const PANEL_STEP = 16;
const panelMaximum = (viewportWidth: number) =>
	Math.max(PANEL_MIN, Math.min(viewportWidth - PREVIEW_MIN, Math.floor(viewportWidth * 0.6)));

export function clampEditorPanelWidth(width: number, viewportWidth: number) {
	return Math.max(
		PANEL_MIN,
		Math.min(panelMaximum(viewportWidth), Number.isFinite(width) ? Math.round(width) : PANEL_MIN),
	);
}

// A visual preference only: the authenticated owner scopes the same width across CVs and letters.
function panelStorageKey(ownerId: string) {
	return `sirawise:editor-panel-width:${ownerId}`;
}
function readPanelWidth(ownerId: string | null) {
	if (!ownerId) return null;
	try {
		const saved = window.localStorage.getItem(panelStorageKey(ownerId));
		const width = saved ? Number(saved) : Number.NaN;
		return Number.isFinite(width) && width > 0 ? width : null;
	} catch {
		return null;
	}
}
function savePanelWidth(ownerId: string | null, width: number | null) {
	if (!ownerId) return;
	try {
		if (width === null) window.localStorage.removeItem(panelStorageKey(ownerId));
		else window.localStorage.setItem(panelStorageKey(ownerId), String(width));
	} catch {
		// The current session still resizes when browser storage is unavailable.
	}
}

/** Owns desktop sizing without remounting the panel or preview during a drag. */
export function EditorPanelLayout({
	ownerId,
	enabled,
	label,
	resizeHint,
	children,
}: {
	ownerId: string | null;
	enabled: boolean;
	label: string;
	resizeHint?: string;
	children: ReactNode;
}) {
	const direction = useDirection();
	const root = useRef<HTMLDivElement>(null);
	const handle = useRef<HTMLDivElement>(null);
	const chosen = useRef<number | null>(null);
	const pending = useRef<number | null>(null);
	const frame = useRef<number | null>(null);
	const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
	const [value, setValue] = useState({ width: 0, max: 0 });

	const applyWidth = useCallback((width: number | null) => {
		const element = root.current;
		const separator = handle.current;
		if (!element || !separator) return;
		if (width === null) element.style.removeProperty("--editor-panel-choice");
		else element.style.setProperty("--editor-panel-choice", `${clampEditorPanelWidth(width, window.innerWidth)}px`);
		// Resolve the shared CSS default rather than duplicating its responsive values in JS.
		const resolved = width ?? Number.parseFloat(window.getComputedStyle(separator).insetInlineStart);
		setValue({ width: clampEditorPanelWidth(resolved, window.innerWidth), max: panelMaximum(window.innerWidth) });
	}, []);

	useLayoutEffect(() => {
		const element = root.current;
		chosen.current = readPanelWidth(ownerId);
		if (enabled) applyWidth(chosen.current);
		else root.current?.style.removeProperty("--editor-panel-choice");
		const resize = () => {
			if (enabled) applyWidth(chosen.current);
		};
		window.addEventListener("resize", resize);
		return () => {
			window.removeEventListener("resize", resize);
			element?.removeAttribute("data-resizing");
			if (frame.current !== null) cancelAnimationFrame(frame.current);
			frame.current = null;
			pending.current = null;
			drag.current = null;
		};
	}, [ownerId, enabled, applyWidth]);

	const finishDrag = () => {
		if (!drag.current) return;
		if (frame.current !== null) cancelAnimationFrame(frame.current);
		frame.current = null;
		if (pending.current !== null) {
			chosen.current = pending.current;
			applyWidth(pending.current);
			pending.current = null;
		}
		drag.current = null;
		root.current?.removeAttribute("data-resizing");
		savePanelWidth(ownerId, chosen.current);
	};

	return (
		<div ref={root} data-slot="editor-panel-layout" className={enabled ? "editor-panel-layout" : "contents"}>
			{children}
			{enabled && (
				<div
					ref={handle}
					role="separator"
					tabIndex={0}
					aria-label={label}
					title={resizeHint}
					aria-orientation="vertical"
					aria-valuemin={PANEL_MIN}
					aria-valuemax={value.max}
					aria-valuenow={value.width}
					className="editor-panel-resizer"
					onKeyDown={(event) => {
						const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
						const width =
							event.key === "Home"
								? PANEL_MIN
								: event.key === "End"
									? value.max
									: delta
										? value.width + delta * (direction === "rtl" ? -1 : 1) * PANEL_STEP
										: null;
						if (width === null) return;
						event.preventDefault();
						event.stopPropagation();
						chosen.current = clampEditorPanelWidth(width, window.innerWidth);
						applyWidth(chosen.current);
						savePanelWidth(ownerId, chosen.current);
					}}
					onDoubleClick={() => {
						finishDrag();
						chosen.current = null;
						applyWidth(null);
						savePanelWidth(ownerId, null);
					}}
					onPointerDown={(event) => {
						if (event.button !== 0) return;
						event.preventDefault();
						event.currentTarget.focus();
						event.currentTarget.setPointerCapture(event.pointerId);
						drag.current = { pointerId: event.pointerId, x: event.clientX, width: value.width };
						root.current?.setAttribute("data-resizing", "");
					}}
					onPointerMove={(event) => {
						const start = drag.current;
						if (!start || start.pointerId !== event.pointerId) return;
						pending.current = clampEditorPanelWidth(
							start.width + (event.clientX - start.x) * (direction === "rtl" ? -1 : 1),
							window.innerWidth,
						);
						if (frame.current !== null) return;
						frame.current = requestAnimationFrame(() => {
							frame.current = null;
							chosen.current = pending.current;
							applyWidth(pending.current);
							pending.current = null;
						});
					}}
					onPointerUp={(event) => {
						if (drag.current?.pointerId !== event.pointerId) return;
						finishDrag();
						event.currentTarget.releasePointerCapture(event.pointerId);
					}}
					onPointerCancel={finishDrag}
					onLostPointerCapture={finishDrag}
				>
					<Icon name="dots-six-vertical" className="editor-panel-grip" />
				</div>
			)}
		</div>
	);
}

export function EditorPanel({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="editor-panel"
			className={cn("editor-panel-container flex min-h-0 min-w-0 flex-col bg-surface", className)}
			{...props}
		/>
	);
}

type EditorPanelHeaderProps = Omit<ComponentProps<"div">, "title"> & {
	title?: ReactNode;
	titleId?: string;
	onClose?: () => void;
	closeLabel?: string;
};
export function EditorPanelHeader({
	className,
	title,
	titleId,
	onClose,
	closeLabel,
	children,
	...props
}: EditorPanelHeaderProps) {
	const labels = useUiLabels();
	return (
		<div
			data-slot="editor-panel-header"
			className={cn("flex shrink-0 flex-col gap-3 border-b border-line px-6 py-4", className)}
			{...props}
		>
			{title && (
				<div className="flex min-h-(--space-24) items-center justify-between gap-3">
					<h2 id={titleId} className="type-title-s">
						{title}
					</h2>
					{onClose && <IconButton icon="x" label={closeLabel ?? labels.close} onClick={onClose} />}
				</div>
			)}
			{children}
		</div>
	);
}

export function EditorPanelBody({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="editor-panel-body"
			className={cn("relative min-h-0 flex-1 overflow-y-auto px-6 py-4 [overflow-anchor:none]", className)}
			{...props}
		/>
	);
}

export function EditorPanelFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="editor-panel-footer"
			className={cn(
				"shrink-0 border-t border-line px-6 pt-4 pb-[max(var(--space-16),env(safe-area-inset-bottom))]",
				className,
			)}
			{...props}
		/>
	);
}
