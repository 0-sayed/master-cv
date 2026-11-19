import type { Application } from "../../types";
import type { InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { SectionCard, SectionCardTitle } from "@reactive-resume/ui/components/section-card";
import { toast } from "@reactive-resume/ui/components/toast";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { buildIcs } from "../../ics";
import { dayKey } from "../../interviews";
import { describeNextStep, getNextStep } from "../../next-step";
import { useInvalidateApplications } from "../../use-application-actions";
import { orpc } from "@/libs/orpc/client";

type NextStepCardProps = {
	application: Application;
	onReopen: () => void;
	onScheduleInterview: (interview: InterviewTimelineEntry | null) => void;
};

/**
 * NEXT STEP: what the application needs, with Edit (schedule an interview or set the follow-up). Dated steps can go
 * to a calendar as an .ics file. Overdue steps are in warn.
 */
export function NextStepCard({ application, onScheduleInterview, onReopen }: NextStepCardProps) {
	const { i18n } = useLingui();
	const [followUpOpen, setFollowUpOpen] = useState(false);
	const step = getNextStep(application);
	const text = describeNextStep(step, application, i18n.locale);

	const addToCalendar = () => {
		if (step.kind !== "interview" && step.kind !== "follow-up") return;
		const start = step.at;
		const minutes = step.kind === "interview" ? step.interview.durationMinutes : 30;
		const ics = buildIcs({
			uid: step.kind === "interview" ? step.interview.id : `follow-up-${application.id}`,
			title: `${text.title} · ${application.role}, ${application.company}`,
			start,
			end: new Date(start.getTime() + minutes * 60_000),
			...(step.kind === "interview" && step.interview.location ? { location: step.interview.location } : {}),
			...(step.kind === "interview" && step.interview.notes ? { description: step.interview.notes } : {}),
		});
		const blob = new Blob([ics], { type: "text/calendar" });
		downloadWithAnchor(blob, `${application.company}-${dayKey(start)}.ics`.replace(/[^\w.-]+/g, "-"));
	};

	const dated = step.kind === "interview" || step.kind === "follow-up";
	return (
		<SectionCard aria-labelledby="application-next-step" tone="highlight">
			<SectionCardTitle as="h2" id="application-next-step" className="text-accent-text">
				<Trans>Next step</Trans>
			</SectionCardTitle>
			<div className="flex flex-wrap items-center gap-3">
				<div className="grid min-w-0 flex-1 basis-full gap-1 sm:basis-0">
					<strong dir="auto" className="type-label wrap-anywhere">
						{step.kind === "closed" ? <Trans>Closed</Trans> : dated ? text.title : <Trans>Choose your next step</Trans>}
					</strong>
					<span dir="auto" className="type-metadata text-accent-text">
						{dated ? text.sub : step.kind === "closed" ? "" : text.title}
					</span>
				</div>
				{step.kind === "closed" ? (
					<Button onClick={onReopen}>
						<Trans>Reopen</Trans>
					</Button>
				) : (
					<>
						{step.kind === "interview" ? (
							<Button onClick={() => onScheduleInterview(step.interview)}>
								<Trans>Interview details</Trans>
							</Button>
						) : (
							<Button onClick={() => setFollowUpOpen(true)}>
								{step.kind === "follow-up" ? <Trans>Edit follow-up</Trans> : <Trans>Set follow-up</Trans>}
							</Button>
						)}
						{!dated && (
							<Button variant="secondary" onClick={() => onScheduleInterview(null)}>
								<Trans>Schedule interview</Trans>
							</Button>
						)}
						{dated && (
							<Button variant="secondary" onClick={addToCalendar}>
								<Icon name="calendar-dots" />
								<Trans>Add to calendar</Trans>
							</Button>
						)}
						<DropdownMenu>
							<DropdownMenuTrigger render={<Button variant="secondary" />}>
								<Trans>Edit</Trans>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{step.kind === "interview" && (
									<DropdownMenuItem onClick={() => onScheduleInterview(step.interview)}>
										<Trans>Edit this interview…</Trans>
									</DropdownMenuItem>
								)}
								<DropdownMenuItem onClick={() => onScheduleInterview(null)}>
									<Trans>Schedule an interview…</Trans>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setFollowUpOpen(true)}>
									{application.followUpAt ? <Trans>Change the follow-up…</Trans> : <Trans>Set a follow-up…</Trans>}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</>
				)}
			</div>
			<FollowUpDialog application={application} open={followUpOpen} onOpenChange={setFollowUpOpen} />
		</SectionCard>
	);
}

type FollowUpDialogProps = { application: Application; open: boolean; onOpenChange: (open: boolean) => void };

/** The follow-up: a date and a note, or cleared. */
function FollowUpDialog({ application, open, onOpenChange }: FollowUpDialogProps) {
	const id = useId();
	const invalidate = useInvalidateApplications();
	const [date, setDate] = useState("");
	const [note, setNote] = useState("");
	const validation = useSubmitValidation({ [`${id}-date`]: !date ? t`Choose a date.` : undefined });
	const [wasOpen, setWasOpen] = useState(false);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			validation.reset();
			setDate(application.followUpAt ? dayKey(new Date(application.followUpAt)) : "");
			setNote(application.followUpNote ?? "");
		}
	}
	const update = useMutation({
		...orpc.applications.update.mutationOptions(),
		onSuccess: () => {
			invalidate(application.id);
			onOpenChange(false);
		},
		onError: () => toast.add({ type: "error", description: t`Couldn't save the follow-up.` }),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>
						<Trans>Follow-up</Trans>
					</DialogTitle>
					<DialogDescription>
						<Trans>A reminder to check in, shown as the next step until you do.</Trans>
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					id={`${id}-form`}
					className="grid gap-3"
					onSubmit={(event) => {
						event.preventDefault();
						if (!validation.validate() || update.isPending) return;
						// A date at 9:00 local time, so it reads as that day everywhere.
						const at = date ? new Date(`${date}T09:00`) : null;
						update.mutate({
							expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
							id: application.id,
							followUpAt: at,
							followUpNote: note.trim() || null,
						});
					}}
				>
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-date`}>
							<Trans>Date</Trans>
							<span aria-hidden="true"> *</span>
						</Label>
						<Input
							id={`${id}-date`}
							type="date"
							aria-required
							aria-invalid={!!validation.errors[`${id}-date`]}
							aria-describedby={`${id}-date-error`}
							value={date}
							onChange={(event) => setDate(event.target.value)}
						/>
						<FieldError id={`${id}-date-error`}>{validation.errors[`${id}-date`]}</FieldError>
					</div>
					<div className="grid gap-1.5">
						<Label htmlFor={`${id}-note`}>
							<Trans>What to do</Trans>
						</Label>
						<Input
							id={`${id}-note`}
							value={note}
							dir="auto"
							placeholder={t`Email the recruiter`}
							onChange={(event) => setNote(event.target.value)}
						/>
					</div>
				</form>
				{update.isError && (
					<Alert variant="error">
						<Icon name="warning" />
						<AlertTitle>
							<Trans>Couldn't save the follow-up.</Trans>
						</AlertTitle>
						<AlertDescription>
							<Trans>Your changes are kept. Retry Save or cancel.</Trans>
						</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					{application.followUpAt && (
						<Button
							variant="ghost"
							disabled={update.isPending}
							className="me-auto"
							onClick={() =>
								update.mutate({
									expectedUpdatedAt: new Date(application.updatedAt).toISOString(),
									id: application.id,
									followUpAt: null,
									followUpNote: null,
								})
							}
						>
							<Trans>Clear</Trans>
						</Button>
					)}
					<Button variant="secondary" onClick={() => onOpenChange(false)}>
						<Trans>Cancel</Trans>
					</Button>
					<Button type="submit" form={`${id}-form`} disabled={update.isPending} loading={update.isPending}>
						<Trans>Save</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
