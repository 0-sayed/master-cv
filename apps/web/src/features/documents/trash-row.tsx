import type { DocumentItemProps } from "./document-card";
import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { useState } from "react";
import { ActionGroup } from "@reactive-resume/ui/components/action-group";
import { Button } from "@reactive-resume/ui/components/button";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { documentCardLayout } from "@reactive-resume/ui/components/document-card-layout";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { useDocumentActions } from "./document-actions";
import { daysLeftInTrash } from "./filter";

/** Trash actions stay visible at every viewport; destructive commits use the shared confirmation. */
export function TrashDocumentRow({ document, selected, onSelectedChange, disabled = false }: DocumentItemProps) {
	const actions = useDocumentActions();
	const [pending, setPending] = useState<"restore" | "purge" | null>(null);
	const days = document.trashedAt ? daysLeftInTrash(document.trashedAt) : 0;
	const act = async (action: "restore" | "purge") => {
		if (pending || disabled) return;
		setPending(action);
		try {
			await actions[action](document);
		} finally {
			setPending(null);
		}
	};
	return (
		<tr className={documentCardLayout.trashRow} aria-label={document.name}>
			{onSelectedChange && (
				<td className={documentCardLayout.trashSelection}>
					<Checkbox
						checked={selected}
						disabled={!!pending || disabled}
						onCheckedChange={onSelectedChange}
						aria-label={t`Select ${document.name}`}
					/>
				</td>
			)}
			<td className={documentCardLayout.trashName}>
				<div className={documentCardLayout.trashIdentity}>
					<Icon name={document.type === "resume" ? "file-text" : "envelope-simple"} className="shrink-0 text-ink-2" />
					<div className="grid min-w-0 gap-0.5">
						<span dir="auto" className="truncate type-label">
							{document.name}
						</span>
						<span className="type-metadata text-ink-2">
							{document.type === "resume" ? <Trans>Resume</Trans> : <Trans>Letter</Trans>}
						</span>
						{document.application && (
							<span dir="auto" className="truncate type-metadata text-ink-2">
								{document.application.company}
							</span>
						)}
					</div>
				</div>
			</td>
			<td className={documentCardLayout.trashRetention}>
				<span
					className={cn("type-body whitespace-nowrap", days <= 3 ? "font-semibold text-danger-text" : "text-ink-2")}
				>
					<Plural value={days} one="Deletes in # day" other="Deletes in # days" context="trash.retention.remaining" />
				</span>
			</td>
			<td className={documentCardLayout.trashActions}>
				<ActionGroup responsive="stack">
					<Button
						variant="secondary"
						disabled={!!pending || disabled}
						loading={pending === "restore"}
						onClick={() => void act("restore")}
					>
						<Icon name="arrow-counter-clockwise" />
						<Trans context="trash.actions.restore">Restore</Trans>
					</Button>
					<Button
						variant="danger"
						disabled={!!pending || disabled}
						loading={pending === "purge"}
						onClick={() => void act("purge")}
					>
						<Icon name="trash" />
						<Trans context="trash.actions.purge">Delete forever</Trans>
					</Button>
				</ActionGroup>
			</td>
		</tr>
	);
}
