import type { ComponentProps, ReactNode } from "react";
import { Button } from "./button";

/** Short editable facts keep each value beside its own label, in either writing direction. */
export function FactChip({
	children,
	detail,
	icon,
	truncate,
	...props
}: Omit<ComponentProps<typeof Button>, "size" | "variant"> & {
	detail?: ReactNode;
	icon?: ReactNode;
	/** Document references keep long names on one line without widening their row. */
	truncate?: boolean;
}) {
	return (
		<Button variant="ghost" size="chip" className="gap-1 bg-sunken text-ink-2" data-slot="fact-chip" {...props}>
			{icon}
			<bdi dir="auto" className={truncate ? "max-w-48 min-w-0 truncate" : undefined}>
				{children}
			</bdi>
			{detail && (
				<>
					<span aria-hidden="true">·</span>
					<bdi className="type-metadata text-ink-2">{detail}</bdi>
				</>
			)}
		</Button>
	);
}
