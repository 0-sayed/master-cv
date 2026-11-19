import type { IconName } from "./icon";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@reactive-resume/utils/style";
import { Icon } from "./icon";

function PropertyList({ className, ...props }: ComponentProps<"dl">) {
	return <dl data-slot="property-list" className={cn("grid divide-y divide-line-1", className)} {...props} />;
}

/** Logical columns keep record labels aligned without changing the direction of saved content. */
function PropertyRow({ icon, label, children }: { icon: IconName; label: ReactNode; children: ReactNode }) {
	return (
		<div data-slot="property-row" className="property-row">
			<dt className="flex min-w-0 items-center gap-2 type-label text-ink-3">
				<Icon name={icon} />
				<span>{label}</span>
			</dt>
			<dd className="min-w-0 type-body wrap-anywhere">{children}</dd>
		</div>
	);
}

export { PropertyList, PropertyRow };
