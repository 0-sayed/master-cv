import type { VariantTerminology } from "@reactive-resume/schema/resume/variants";
import { Trans } from "@lingui/react/macro";
import { useId, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import {
	TaskOverlay as Dialog,
	TaskOverlayContent as DialogContent,
	TaskOverlayTitle as DialogTitle,
	TaskOverlayDescription as DialogDescription,
	TaskOverlayFooter as DialogFooter,
} from "@reactive-resume/ui/components/task-overlay";
import { ReviewNotice } from "../editor/proposals/review-operation";
import { useVariantsCopy } from "./copy.generated";
export function TermDialog({
	term,
	pending,
	error,
	onCancel,
	onConfirm,
}: {
	term: VariantTerminology["terms"][number];
	pending: boolean;
	error: boolean;
	onCancel: () => void;
	onConfirm: (text: string) => void;
}) {
	const copy = useVariantsCopy();
	const id = useId();
	const [value, setValue] = useState(term.value);
	const valid = Boolean(value.trim()) && value.length <= 4000 && !/<[^>]*>/u.test(value);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onCancel();
			}}
		>
			<DialogContent>
				<DialogTitle>{copy("language.terms.title")}</DialogTitle>
				<DialogDescription>{copy("language.term.editHint")}</DialogDescription>
				<p dir="auto">{term.source}</p>
				<Label htmlFor={id}>
					<Trans>Reviewed term</Trans>
				</Label>
				<Input
					id={id}
					dir="auto"
					value={value}
					maxLength={4000}
					aria-invalid={!valid}
					onChange={(event) => setValue(event.target.value)}
				/>
				{!valid && (
					<p role="alert">
						<Trans>Enter a term without markup, up to 4000 characters.</Trans>
					</p>
				)}
				{error && (
					<ReviewNotice>
						<Trans>The term was not saved. Your correction is kept.</Trans>
					</ReviewNotice>
				)}
				<DialogFooter>
					<Button variant="secondary" disabled={pending} onClick={onCancel}>
						<Trans>Cancel</Trans>
					</Button>
					<Button disabled={pending || !valid} onClick={() => onConfirm(value.trim())}>
						{copy("language.term.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
