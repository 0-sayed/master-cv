import type { ReactNode } from "react";
import { plural, t } from "@lingui/core/macro";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Disclosure, DisclosureSummary, DisclosureContent } from "@reactive-resume/ui/components/disclosure";
import { SectionCard } from "@reactive-resume/ui/components/section-card";

export function FindingGroup({
	count,
	code,
	title,
	onFixAll,
	locked,
	selected,
	children,
}: {
	count: number;
	code: string;
	title: string;
	onFixAll?: (() => void) | undefined;
	locked: boolean;
	selected: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	if (count < 2) return children;
	const label =
		code === "NON_STANDARD_SECTION_TITLE"
			? plural(count, { one: "# section uses an unfamiliar heading", other: "# sections use unfamiliar headings" })
			: t`${count} findings: ${title}`;
	return (
		<SectionCard variant="flush" data-finding-group={code}>
			<Disclosure open={open || selected} onToggle={(event) => setOpen(event.currentTarget.open)}>
				<DisclosureSummary>{label}</DisclosureSummary>
				<DisclosureContent>
					{onFixAll && <Button disabled={locked} onClick={onFixAll}>{t`Fix all`}</Button>}
					<div className="grid divide-y divide-line">{children}</div>
				</DisclosureContent>
			</Disclosure>
		</SectionCard>
	);
}
