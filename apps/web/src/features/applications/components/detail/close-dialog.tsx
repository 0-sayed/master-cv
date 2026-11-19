import type { ApplicationClosedReason } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useId, useState } from "react";
import { Alert, AlertTitle, AlertDescription } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { Icon } from "@reactive-resume/ui/components/icon";
import { RadioGroup, RadioGroupItem } from "@reactive-resume/ui/components/radio-group";
import { CLOSED_REASONS, getClosedReasonLabel } from "../../stages";

type CloseDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onClose: (reason: ApplicationClosedReason) => void;
	pending?: boolean;
	error?: unknown;
	waitForAcknowledgement?: boolean;
};

/** "Close this application": one reason, kept for Insights. It replaces Reject, Archive and Delete buttons. */
export function CloseDialog({
	open,
	onOpenChange,
	onClose,
	pending = false,
	error,
	waitForAcknowledgement = false,
}: CloseDialogProps) {
	const id = useId();
	const [reason, setReason] = useState<ApplicationClosedReason>("not-selected");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						<Trans>Close this application</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>The reason is kept for Insights. Linked documents aren't touched.</Trans>
					</DialogDescription>
				</DialogHeader>
				<RadioGroup
					disabled={pending}
					aria-label={t`Reason`}
					value={reason}
					onValueChange={(value) => setReason(value as ApplicationClosedReason)}
					className="grid gap-1"
				>
					{CLOSED_REASONS.map((value) => (
						<div
							key={value}
							className="flex h-10 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-hover"
						>
							<RadioGroupItem id={`${id}-${value}`} value={value} />
							<label htmlFor={`${id}-${value}`} className="flex-1 cursor-pointer text-sm">
								{getClosedReasonLabel(value)}
							</label>
						</div>
					))}
				</RadioGroup>
				{!!error && (
					<Alert variant="error">
						<Icon name="warning" />
						<AlertTitle>
							<Trans>The application could not be closed.</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>Your reason is kept. Retry or cancel.</Trans>
						</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button
						disabled={pending}
						loading={pending}
						onClick={() => {
							if (pending) return;
							onClose(reason);
							if (!waitForAcknowledgement) onOpenChange(false);
						}}
					>
						<Trans>Close application</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
