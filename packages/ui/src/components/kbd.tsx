import { cn } from "@reactive-resume/utils/style";

/** Canonical hotkey notation stays out of catalogs; Mod follows the same platform rule as the hotkey handler. */
function shortcutLabel(keys: string) {
	const mac = typeof navigator !== "undefined" && /mac/i.test(`${navigator.platform} ${navigator.userAgent}`);
	const labels: Record<string, string> = {
		Mod: mac ? "⌘" : "Ctrl",
		Control: mac ? "⌃" : "Ctrl",
		Alt: mac ? "⌥" : "Alt",
		Shift: mac ? "⇧" : "Shift",
		ArrowUp: "↑",
		ArrowDown: "↓",
		ArrowLeft: "←",
		ArrowRight: "→",
		Escape: "Esc",
	};
	const parts = keys.split("+").map((part) =>
		part
			.split("/")
			.map((key) => labels[key] ?? key)
			.join("/"),
	);
	return parts.join(keys.includes("Arrow") ? " + " : mac ? "" : " ");
}

function Kbd({ className, keys, children, ...props }: React.ComponentProps<"kbd"> & { keys?: string }) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"pointer-events-none inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center gap-1 rounded-sm bg-sunken px-1 align-middle type-metadata font-mono font-medium whitespace-nowrap text-ink-3 select-none [unicode-bidi:isolate] in-data-[slot=tooltip-content]:bg-bg/15 in-data-[slot=tooltip-content]:text-bg [&_svg:not([class*='size-'])]:size-3",
				className,
			)}
			{...props}
			dir="ltr"
		>
			{keys ? shortcutLabel(keys) : children}
		</kbd>
	);
}

export { Kbd };
