import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@reactive-resume/utils/style";

/** Shared viewport toolbar for selected dashboard records, above the mobile navigation. */
export function SelectionBar({ count, label, children }: { count: number; label: string; children: ReactNode }) {
	return createPortal(
		<div
			role="toolbar"
			aria-label={label}
			aria-hidden={count === 0}
			inert={count === 0}
			className={cn(
				"fixed inset-x-0 bottom-[calc(var(--space-24)+env(safe-area-inset-bottom))] z-30 mx-auto flex w-fit max-w-[calc(100vw-var(--space-32))] flex-wrap items-center justify-center gap-1 rounded-xl border border-line bg-raised p-1.5 shadow-e3 transition-[opacity,translate] duration-standard ease-enter max-sm:bottom-[calc(var(--space-64)+var(--space-16)+env(safe-area-inset-bottom))]",
				count === 0 && "pointer-events-none translate-y-2 opacity-0",
			)}
		>
			{children}
		</div>,
		document.body,
	);
}
