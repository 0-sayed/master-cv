import type { ComponentProps, ReactNode } from "react";
import { Button } from "./button";

/** Short editable facts keep each value beside its own label, in either writing direction. */
export function FactChip({
	children,
	detail,
	...props
}: Omit<ComponentProps<typeof Button>, "size" | "variant"> & { detail?: ReactNode }) {
	return (
		<Button variant="ghost" size="chip" className="gap-1 bg-sunken text-ink-2" data-slot="fact-chip" {...props}>
			<bdi>{children}</bdi>
			{detail && (
				<>
					<span aria-hidden="true">·</span>
					<bdi className="type-metadata text-ink-2">{detail}</bdi>
				</>
			)}
		</Button>
	);
}
