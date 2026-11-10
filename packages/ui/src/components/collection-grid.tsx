import type { ComponentProps, ReactNode } from "react";
import { Children } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Collections gain columns at wide viewports; their cards retain their proportions. */
export function CollectionGrid({
	variant = "documents",
	className,
	...props
}: ComponentProps<"div"> & { variant?: "documents" | "sections" }) {
	return (
		<div data-slot="collection-grid" data-variant={variant} className={cn("collection-grid", className)} {...props} />
	);
}

/** Preserve the two-column section order below the wide breakpoint. */
export function CollectionGridGroup(props: ComponentProps<"div">) {
	return <div data-slot="collection-grid-group" {...props} />;
}

/** Loaded sections and their skeletons share both grouping and intrinsic card alignment. */
export function SectionCollection({ children }: { children: ReactNode }) {
	const cards = Children.toArray(children);
	return (
		<CollectionGrid variant="sections">
			<div className="grid content-start gap-4">{cards.slice(0, 2)}</div>
			<CollectionGridGroup>
				<div className="grid content-start gap-4">{cards.slice(2, 4)}</div>
				{cards.slice(4)}
			</CollectionGridGroup>
		</CollectionGrid>
	);
}
