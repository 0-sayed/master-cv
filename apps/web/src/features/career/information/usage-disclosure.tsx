import type { CareerMaster } from "@reactive-resume/schema/career-master";
import type { RefObject, ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { useId, useRef, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@reactive-resume/ui/components/popover";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@reactive-resume/ui/components/sheet";
import { useBreakpoint } from "@reactive-resume/ui/hooks/use-breakpoint";
import { useCareerCopy } from "../copy.generated";
import { distinctDocuments } from "./presentation";

type CareerUsageDisclosureProps = {
	entryLabel: string;
	documents: CareerMaster["links"];
	fallbackFocusRef: RefObject<HTMLElement | null>;
};
export function CareerUsageDisclosure({
	entryLabel,
	documents,
	fallbackFocusRef,
}: CareerUsageDisclosureProps): ReactNode {
	const copy = useCareerCopy();
	const { t } = useLingui();
	const mobile = useBreakpoint() === "mobile";
	const [state, setState] = useState({ mobile, open: false });
	if (state.mobile !== mobile) setState({ mobile, open: false });
	const open = state.mobile === mobile && state.open;
	const setOpen = (open: boolean) => setState({ mobile, open });
	const triggerRef = useRef<HTMLButtonElement>(null);
	const titleId = useId();
	const descriptionId = useId();
	const links = distinctDocuments(documents);
	const returnFocus = () =>
		triggerRef.current?.isConnected ? triggerRef.current : (fallbackFocusRef.current ?? false);
	if (!links.length) return null;
	const trigger = (
		<Button ref={triggerRef} variant="secondary" size="row" className="type-metadata text-accent-text">
			{" "}
			<Icon name="file-text" />
			{copy("editor.field.usageCount", { count: links.length, countLabel: String(links.length) })}
		</Button>
	);
	const list = (
		<div className="grid gap-1">
			{links.map((link) => (
				<Button
					key={link.resumeId}
					variant="ghost"
					size="row"
					className="justify-start text-start"
					render={
						<Link
							to="/builder/$resumeId"
							params={{ resumeId: link.resumeId }}
							onClick={() => setOpen(false)}
							aria-label={copy("editor.field.openCV", { name: link.name })}
						/>
					}
				>
					<Icon name="file-text" />
					<span className="min-w-0 wrap-anywhere" dir="auto">
						{link.name}
					</span>
				</Button>
			))}
		</div>
	);
	const description = (
		<>
			<span className="block wrap-anywhere" dir="auto">
				{entryLabel}
			</span>
			<span className="block">{copy("editor.field.usageHint")}</span>
		</>
	);
	if (mobile)
		return (
			<Sheet open={open} onOpenChange={setOpen}>
				<SheetTrigger render={trigger} />
				<SheetContent side="bottom" closeLabel={t`Close`} finalFocus={returnFocus}>
					<SheetHeader>
						<SheetTitle>{copy("editor.field.usageTitle")}</SheetTitle>
						<SheetDescription>{description}</SheetDescription>
					</SheetHeader>
					<div className="min-h-0 overflow-y-auto px-4 pb-4">{list}</div>
				</SheetContent>
			</Sheet>
		);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger render={trigger} />
			<PopoverContent
				align="start"
				className="max-w-full"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				finalFocus={returnFocus}
			>
				<PopoverHeader>
					<div className="flex items-start justify-between gap-2">
						<PopoverTitle id={titleId}>{copy("editor.field.usageTitle")}</PopoverTitle>
						<IconButton size="icon-lg" label={t`Close`} onClick={() => setOpen(false)} icon="x" />
					</div>
				</PopoverHeader>
				<p id={descriptionId} className="type-body text-ink-2">
					{description}
				</p>
				{list}
			</PopoverContent>
		</Popover>
	);
}
