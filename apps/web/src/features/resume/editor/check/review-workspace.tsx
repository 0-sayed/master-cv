import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { cn } from "@reactive-resume/utils/style";
import { CheckPanel } from "./check-panel";

export function ReviewWorkspace({
	preview,
	panel,
	expanded = true,
	phone = false,
	pageVisible = true,
	drawer = false,
	drawerOpen = true,
}: {
	preview: ReactNode;
	panel?: ReactNode;
	expanded?: boolean;
	phone?: boolean;
	pageVisible?: boolean;
	drawer?: boolean;
	drawerOpen?: boolean;
}) {
	return (
		<div className={cn("relative grid min-h-0 min-w-0 editor-standard-layout", phone && "editor-phone-layout")}>
			<h1 className="sr-only">{expanded ? t`Review your CV` : t`CV editor`}</h1>
			<div
				inert={(phone && pageVisible) || (drawer && !drawerOpen)}
				className={cn(
					"editor-panel-container min-h-0 min-w-0 border-e border-line bg-surface",
					phone && "absolute inset-0 z-10",
					phone && pageVisible && "invisible",
					drawer && "editor-panel-drawer",
					drawer && !drawerOpen && "invisible",
				)}
			>
				{panel ?? (expanded ? <CheckPanel phone={phone} active={!phone || !pageVisible} /> : null)}
			</div>
			<main
				id="main-content"
				inert={phone && !pageVisible}
				aria-label={t`CV preview`}
				className={cn("relative min-h-0 min-w-0", phone && !pageVisible && "invisible")}
			>
				{preview}
			</main>
		</div>
	);
}
