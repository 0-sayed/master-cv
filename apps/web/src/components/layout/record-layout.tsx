import type { ReactElement, ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";

type RecordLayoutProps = {
	main: ReactNode;
	properties: ReactNode;
	documents: ReactNode;
	preparation?: ReactNode;
};

export function RecordLayout({ main, properties, documents, preparation }: RecordLayoutProps): ReactElement {
	const breakpoint = useBreakpoint();
	const desktop = breakpoint === "desktop" || breakpoint === "wide";
	const panels = {
		main: (
			<div key="main" className="grid min-w-0 gap-6">
				{main}
			</div>
		),
		details: (
			<aside key="details" aria-label={t`Record details`} className="grid min-w-0 gap-6">
				{properties}
				{documents}
				{preparation}
			</aside>
		),
	};
	return (
		<div
			className="record-layout grid items-start gap-6"
			data-testid="application-detail-columns"
			data-slot="application-detail-columns"
		>
			{desktop ? [panels.main, panels.details] : [panels.details, panels.main]}
		</div>
	);
}
