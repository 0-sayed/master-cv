import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import { Trans } from "@lingui/react/macro";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { LIST_ORDER } from "../stages";
import { browserStorage, storageKey } from "@/libs/browser-storage";

const key = storageKey("applicationGroups");

function readCollapsed(): ReadonlySet<ApplicationStatus> {
	try {
		const saved: unknown = JSON.parse(browserStorage.local.getItem(key) ?? "[]");
		return new Set(Array.isArray(saved) ? LIST_ORDER.filter((status) => saved.includes(status)) : []);
	} catch {
		return new Set();
	}
}

export function useApplicationGroupCollapse() {
	const [collapsed, setCollapsed] = useState(readCollapsed);
	const update = (next: ReadonlySet<ApplicationStatus>) => {
		setCollapsed(next);
		try {
			browserStorage.local.setItem(key, JSON.stringify([...next]));
		} catch {
			// Keep the current visit usable when device storage is unavailable.
		}
	};
	return {
		collapsed,
		toggleGroup: (status: ApplicationStatus) => {
			const next = new Set(collapsed);
			if (next.has(status)) next.delete(status);
			else next.add(status);
			update(next);
		},
		setAllExpanded: (expanded: boolean) => update(new Set(expanded ? [] : LIST_ORDER)),
	};
}

export type ApplicationGroupCollapseState = ReturnType<typeof useApplicationGroupCollapse>;

export function ApplicationGroupToggle({
	state,
	statuses,
}: {
	state: ApplicationGroupCollapseState;
	statuses: ApplicationStatus[];
}) {
	const expanded = statuses.some((status) => !state.collapsed.has(status));
	return (
		<Button
			size="toolbar"
			variant="secondary"
			aria-expanded={expanded}
			aria-pressed={!expanded}
			disabled={statuses.length === 0}
			onClick={() => state.setAllExpanded(!expanded)}
		>
			<Icon name="caret-down" className={expanded ? "rotate-180" : undefined} />
			{expanded ? <Trans>Collapse all</Trans> : <Trans>Expand all</Trans>}
		</Button>
	);
}
