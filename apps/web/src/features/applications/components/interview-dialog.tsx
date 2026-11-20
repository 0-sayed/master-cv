import type { Application } from "../types";
import type { InterviewKind, InterviewTimelineEntry } from "@reactive-resume/schema/applications/data";
import type { RefObject } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import { interviewDetailsSchema, interviewParticipantSchema } from "@reactive-resume/schema/applications/data";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { Button } from "@reactive-resume/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Input } from "@reactive-resume/ui/components/input";
import { Label } from "@reactive-resume/ui/components/label";
import { ScrollArea } from "@reactive-resume/ui/components/scroll-area";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { toast } from "@reactive-resume/ui/components/toast";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { generateId } from "@reactive-resume/utils/string";
import { cn } from "@reactive-resume/utils/style";
import { fromZonedDateTime } from "@reactive-resume/utils/timezone";
import { dayKey, formatDuration, interviewTypeLabel } from "../interviews";
import { isHttpLink } from "../links";
import { applicationsListQueryKey } from "../queries";
import { ApplicationPicker } from "./application-picker";
import { LocalDateInput } from "@/components/input/local-date-input";
import { Combobox } from "@/components/ui/combobox";
import { useCareerTime, useNow, confirmAction } from "@/features/career/shared";
import { useClosingValue } from "@/hooks/use-closing-value";
import { formatInterfaceDate } from "@/libs/locale";
import { getInterfaceDateLocale } from "@/libs/locale";
import { orpc } from "@/libs/orpc/client";

export { interviewTypeLabel } from "../interviews";

const KINDS: InterviewKind[] = ["screening", "technical", "behavioral", "onsite", "other"];
const LENGTHS = [30, 45, 60, 90];
const meetingMode = (location = ""): "online" | "in-person" | "phone" =>
	!location || isHttpLink(location) ? "online" : /^\+?[\d\s()-]{5,}$/.test(location) ? "phone" : "in-person";

// ---- Wall-clock time in a named timezone ----

const zoneFormatter = (timeZone: string) =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});

/** An instant as the date ("2026-10-08") and time ("17:58") on a clock in `timeZone`. */
function zonedParts(instant: Date | string, timeZone: string) {
	const parts = Object.fromEntries(
		zoneFormatter(timeZone)
			.formatToParts(new Date(instant))
			.map(({ type, value }) => [type, value]),
	);
	return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

const isTimeZone = (value: string) => {
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
};

type Draft = {
	applicationId: string;
	kind: InterviewKind;
	date: string;
	time: string;
	durationMinutes: number;
	location: string;
	notes: string;
	/** Not shown any more; kept so saving doesn't reset it. */
	audience: InterviewTimelineEntry["audience"];
	timezone: string;
	participants: { id: string; name: string; role: string; profileUrl: string }[];
};

// New interviews default to the given day (or tomorrow) at 09:00 in the timezone, or the next full hour if that's past.
function emptyDraft(applicationId: string, timezone: string, day?: Date | null): Draft {
	const now = new Date();
	const date = dayKey(day ?? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
	let at = fromZonedDateTime(date, "09:00", timezone) ?? now;
	if (at <= now) at = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
	return {
		applicationId,
		kind: "screening",
		...zonedParts(at, timezone),
		durationMinutes: 60,
		location: "",
		notes: "",
		audience: "other",
		timezone,
		participants: [],
	};
}

const draftFrom = (applicationId: string, interview: InterviewTimelineEntry, fallbackZone: string): Draft => {
	const timezone = interview.timezone && isTimeZone(interview.timezone) ? interview.timezone : fallbackZone;
	return {
		applicationId,
		kind: interview.kind,
		...zonedParts(interview.at, timezone),
		durationMinutes: interview.durationMinutes,
		location: interview.location,
		notes: interview.notes,
		audience: interview.audience ?? "other",
		timezone,
		participants: (interview.participants ?? []).map((participant) => ({
			id: generateId(),
			name: participant.name,
			role: participant.role,
			profileUrl: participant.profileUrl ?? "",
		})),
	};
};

type InterviewDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	// The application the interview belongs to. When omitted, an application picker is shown
	// (used by the calendar, where no application is selected yet).
	application?: Application | null;
	// Applications offered by the picker when `application` is omitted.
	applications?: Application[];
	// Set when editing an existing interview.
	interview?: InterviewTimelineEntry | null;
	// Pre-selects this day when scheduling (e.g. a day clicked on the calendar).
	day?: Date | null;
	onOpenApplication?: (application: Application) => void;
	finalFocus?: RefObject<HTMLElement | null>;
};

/** W20: type, time, length, people and what they asked for. Date and time are wall-clock in the interview's timezone. */
export function InterviewDialog({
	open,
	onOpenChange,
	application,
	applications = [],
	interview,
	day,
	onOpenApplication,
	finalFocus,
}: InterviewDialogProps) {
	const queryClient = useQueryClient();
	const { i18n } = useLingui();
	const now = useNow();
	const { when, timeZone: savedZone } = useCareerTime();
	const preferredZone = savedZone === "UTC" ? Intl.DateTimeFormat().resolvedOptions().timeZone : savedZone;
	const id = useId();
	// Held through the closing animation, so the title and Delete don't flip while it fades.
	const [editing, onOpenChangeComplete] = useClosingValue(interview ?? null);
	const [draft, setDraft] = useState<Draft>(() =>
		interview
			? draftFrom(application?.id ?? "", interview, preferredZone)
			: emptyDraft(application?.id ?? "", preferredZone, day),
	);
	const [otherZone, setOtherZone] = useState(false);
	const [mode, setMode] = useState<"online" | "in-person" | "phone">(meetingMode(interview?.location));

	// A fresh draft each time the dialog opens, adjusted during render so the first frame is never stale.
	const [wasOpen, setWasOpen] = useState(open);

	const invalidate = (applicationId: string) => {
		void queryClient.invalidateQueries({ queryKey: applicationsListQueryKey() });
		void queryClient.invalidateQueries({
			queryKey: orpc.applications.getById.queryKey({ input: { id: applicationId } }),
		});
	};

	const add = useMutation(
		orpc.applications.addInterview.mutationOptions({
			onError: () => toast.add({ type: "error", description: t`Couldn't schedule the interview.` }),
		}),
	);
	const update = useMutation(
		orpc.applications.updateInterview.mutationOptions({
			onError: () => toast.add({ type: "error", description: t`Couldn't update the interview.` }),
		}),
	);
	const remove = useMutation(
		orpc.applications.deleteTimelineEntry.mutationOptions({
			onSettled: (_data, _error, variables) => invalidate(variables.id),
			onError: () => toast.add({ type: "error", description: t`Couldn't delete the interview.` }),
		}),
	);

	const zones = useMemo(() => {
		const all = Intl.supportedValuesOf("timeZone");
		return all.includes(draft.timezone) ? all : [draft.timezone, ...all];
	}, [draft.timezone]);

	const pending = add.isPending || update.isPending;
	const original = editing ? zonedParts(editing.at, draft.timezone) : null;
	// Keep the exact stored instant when the clock time is unchanged, including during a DST overlap.
	const at =
		editing && original?.date === draft.date && original.time === draft.time
			? new Date(editing.at)
			: draft.date && draft.time
				? fromZonedDateTime(draft.date, draft.time, draft.timezone)
				: null;
	const details = interviewDetailsSchema.safeParse({
		...draft,
		participants: draft.participants
			.filter(({ name }) => name.trim())
			.map(({ name, role, profileUrl }) => ({
				name,
				role,
				...(profileUrl.trim() ? { profileUrl: profileUrl.trim() } : {}),
			})),
	});
	const validation = useSubmitValidation({
		[`${id}-application`]: !draft.applicationId ? t`Choose an application.` : undefined,
		[`${id}-date`]: !draft.date ? t`Choose a valid date.` : undefined,
		[`${id}-time`]: !draft.time || !at ? t`Choose a valid time in this time zone.` : undefined,
		[`${id}-location`]:
			mode === "online" && draft.location.trim() && !isHttpLink(draft.location)
				? t`Enter a valid HTTP or HTTPS link.`
				: mode === "phone" && draft.location.trim() && !/^\+?[\d\s()-]{5,}$/.test(draft.location)
					? t`Enter a valid phone number.`
					: undefined,
		...Object.fromEntries(
			draft.participants.flatMap((participant) => [
				[
					`${id}-${participant.id}-name`,
					!participant.name.trim() && (participant.role.trim() || participant.profileUrl.trim())
						? t`Enter this person's name.`
						: undefined,
				],
				[
					`${id}-${participant.id}-profile`,
					participant.profileUrl &&
					!interviewParticipantSchema.shape.profileUrl.safeParse(participant.profileUrl).success
						? t`Profile links must be public HTTPS addresses.`
						: undefined,
				],
			]),
		),
	});
	const error = (field: string) => validation.errors[`${id}-${field}`];
	const fieldProps = (field: string) => ({
		"aria-invalid": Boolean(error(field)),
		"aria-describedby": error(field) ? `${id}-${field}-error` : undefined,
	});
	const zoneName =
		new Intl.DateTimeFormat(getInterfaceDateLocale(i18n.locale), { timeZone: draft.timezone, timeZoneName: "long" })
			.formatToParts(at ?? now)
			.find((part) => part.type === "timeZoneName")?.value ?? draft.timezone;
	const showZone = otherZone || draft.timezone !== preferredZone;
	const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));
	const setParticipant = (participantId: string, patch: Partial<Draft["participants"][number]>) =>
		setDraft((prev) => ({
			...prev,
			participants: prev.participants.map((participant) =>
				participant.id === participantId ? { ...participant, ...patch } : participant,
			),
		}));

	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			const applicationId = application?.id ?? "";
			setDraft(
				interview ? draftFrom(applicationId, interview, preferredZone) : emptyDraft(applicationId, preferredZone, day),
			);
			setOtherZone(false);
			validation.reset();
			setMode(meetingMode(interview?.location));
		}
	}

	const save = async () => {
		if (!validation.validate() || !at || !details.success || pending) return;
		const input = { id: draft.applicationId, at: at.toISOString(), ...details.data };
		try {
			if (editing) await update.mutateAsync({ ...input, entryId: editing.id });
			else await add.mutateAsync(input);
		} catch {
			return;
		}
		invalidate(draft.applicationId);
		onOpenChange(false);
		// The server moves this interview's briefing schedule with it; say where it went.
		const schedules =
			editing && isFeatureAvailable("careerAutomation")
				? await queryClient
						.fetchQuery({ ...orpc.career.schedules.queryOptions({ input: {} }), staleTime: 0 })
						.catch(() => [])
				: [];
		const schedule = schedules.find(
			(item) => item.kind === "prepare" && item.interviewId === editing?.id && item.enabled,
		);
		toast.add({
			type: "success",
			description: schedule ? t`Interview saved · briefing moves to ${when(schedule.nextRunAt)}` : t`Interview saved`,
		});
	};

	const deleteInterview = () => {
		if (!editing) return;
		const applicationId = draft.applicationId;
		confirmAction({
			description: t`Interview deleted`,
			commit: () => remove.mutateAsync({ id: applicationId, entryId: editing.id }),
			onCommitted: () => {
				invalidate(applicationId);
				onOpenChange(false);
			},
		});
	};

	const lengths = LENGTHS.includes(draft.durationMinutes)
		? LENGTHS
		: [...LENGTHS, draft.durationMinutes].sort((a, b) => a - b);

	return (
		<Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
			<DialogContent
				mobile="full-screen"
				finalFocus={finalFocus}
				closeLabel={t`Close`}
				className={cn("flex max-h-[min(820px,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl")}
			>
				<div className="grid gap-0.5 ps-6 pe-14 pt-5">
					<DialogTitle>{editing ? <Trans>Edit interview</Trans> : <Trans>Schedule an interview</Trans>}</DialogTitle>
					<DialogDescription>
						{application ? (
							<>
								<bdi dir="auto">{application.role}</bdi> · <bdi dir="auto">{application.company}</bdi>
							</>
						) : (
							<Trans>It will show on the application's timeline and on the calendar.</Trans>
						)}
					</DialogDescription>
				</div>

				{editing && application && (
					<div className="grid gap-2 px-6 pt-4 type-metadata">
						<p>
							{interviewTypeLabel(editing.kind)} · {formatDuration(editing.durationMinutes, i18n.locale)} ·{" "}
							<bdi dir="ltr">
								{formatInterfaceDate(new Date(editing.at), i18n.locale, {
									dateStyle: "medium",
									timeStyle: "short",
									timeZone: draft.timezone,
								})}{" "}
								· {draft.timezone}
							</bdi>
						</p>
						{editing.location && (
							<bdi dir="auto" className="wrap-anywhere">
								{editing.location}
							</bdi>
						)}
						<div className="flex flex-wrap gap-2">
							{isHttpLink(editing.location) && (
								<Button
									size="sm"
									variant="secondary"
									nativeButton={false}
									role="link"
									render={<a href={editing.location.trim()} target="_blank" rel="noopener noreferrer" />}
								>
									<Trans>Join</Trans>
								</Button>
							)}
							{onOpenApplication && (
								<Button
									size="sm"
									variant="secondary"
									onClick={() => {
										onOpenChange(false);
										onOpenApplication(application);
									}}
								>
									<Trans>View application</Trans>
								</Button>
							)}
						</div>
					</div>
				)}
				<ScrollArea className="flex-1">
					<form
						id={`${id}-form`}
						noValidate
						onSubmit={(event) => {
							event.preventDefault();
							void save();
						}}
						className="grid min-h-0 flex-1 content-start gap-6 px-6 py-5"
					>
						<section className="grid gap-3">
							<h3 className="type-section">
								<Trans>Interview details</Trans>
							</h3>
							{!application && (
								<Field label={t`Application`} required htmlFor={`${id}-application`} error={error("application")}>
									<ApplicationPicker
										id={`${id}-application`}
										className="w-full"
										value={draft.applicationId || null}
										placeholder={t`Choose an application…`}
										{...fieldProps("application")}
										aria-required
										emptyMessage={t`No active applications.`}
										applications={applications}
										onValueChange={(value) => set("applicationId", value ?? "")}
									/>
								</Field>
							)}

							<Field label={t`Type`}>
								<Segments
									label={t`Type`}
									value={draft.kind}
									options={KINDS.map((kind) => ({ value: kind, label: interviewTypeLabel(kind) }))}
									onChange={(kind) => set("kind", kind)}
								/>
							</Field>
						</section>
						<section className="grid gap-3 border-t border-line pt-4">
							<h3 className="type-section">
								<Trans>When</Trans>
							</h3>
							<div className="grid gap-3 sm:grid-cols-2">
								<Field label={t`Date`} required htmlFor={`${id}-date`} error={error("date")}>
									<LocalDateInput
										id={`${id}-date`}
										locale={i18n.locale}
										calendarLabel={t`Choose a date.`}
										required
										{...fieldProps("date")}
										value={draft.date}
										onValueChange={(value) => set("date", value)}
									/>
								</Field>
								<Field label={t`Time`} required htmlFor={`${id}-time`} error={error("time")}>
									<Input
										id={`${id}-time`}
										dir="ltr"
										inputMode="numeric"
										placeholder="09:00"
										required
										{...fieldProps("time")}
										value={draft.time}
										onChange={(event) => set("time", event.target.value)}
									/>
								</Field>
							</div>
							<Field label={t`Length · minutes`}>
								<Segments
									label={t`Length in minutes`}
									value={draft.durationMinutes}
									options={lengths.map((minutes) => ({ value: minutes, label: String(minutes) }))}
									onChange={(minutes) => set("durationMinutes", minutes)}
								/>
							</Field>

							{showZone ? (
								<div className="-mt-1 grid gap-1.5">
									<Field label={t`Interview timezone`} htmlFor={`${id}-timezone`}>
										<Combobox
											id={`${id}-timezone`}
											className="w-full"
											value={draft.timezone}
											options={zones.map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))}
											onValueChange={(value) => value && set("timezone", value)}
										/>
									</Field>
									{at && draft.timezone !== preferredZone && (
										<p className="type-metadata text-ink-3">
											<Trans>
												{draft.time} in {draft.timezone} is{" "}
												{new Intl.DateTimeFormat(getInterfaceDateLocale(i18n.locale), {
													timeZone: preferredZone,
													hour: "2-digit",
													minute: "2-digit",
													hourCycle: "h23",
												}).format(at)}{" "}
												in your timezone ({preferredZone}).
											</Trans>
										</p>
									)}
								</div>
							) : (
								<p className="-mt-2 type-metadata text-ink-3">
									{zoneName}{" "}
									<button
										type="button"
										className="underline underline-offset-2 transition-colors duration-quick hover:text-ink-2"
										onClick={() => setOtherZone(true)}
									>
										<Trans>Interview is in another timezone</Trans>
									</button>
								</p>
							)}
						</section>
						<section className="grid gap-3 border-t border-line pt-4">
							<h3 className="type-section">
								<Trans>Where</Trans>
							</h3>
							<Segments
								label={t`Meeting format`}
								value={mode}
								options={[
									{ value: "online", label: t`Online` },
									{ value: "in-person", label: t`In person` },
									{ value: "phone", label: t`Phone` },
								]}
								onChange={setMode}
							/>
							<Field
								label={
									mode === "online"
										? t`Meeting link (optional)`
										: mode === "phone"
											? t`Phone number (optional)`
											: t`Office address (optional)`
								}
								htmlFor={`${id}-location`}
								error={error("location")}
							>
								<Input
									id={`${id}-location`}
									{...fieldProps("location")}
									value={draft.location}
									maxLength={500}
									placeholder={
										mode === "online"
											? t`https://meet.example.com/your-meeting`
											: mode === "phone"
												? t`Phone number with country code`
												: t`Building, street, city`
									}
									dir="auto"
									onChange={(event) => set("location", event.target.value)}
								/>
							</Field>
						</section>
						<fieldset className="grid gap-3 border-t border-line pt-4">
							<legend className="type-section">
								<Trans>Who you'll meet</Trans>
							</legend>
							{draft.participants.map((participant, index) => (
								<div key={participant.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] gap-2">
									<Input
										aria-label={t`Name of person ${index + 1}`}
										id={`${id}-${participant.id}-name`}
										{...fieldProps(`${participant.id}-name`)}
										placeholder={t`Name`}
										value={participant.name}
										maxLength={200}
										onChange={(event) => setParticipant(participant.id, { name: event.target.value })}
									/>
									<Input
										aria-label={t`Role of person ${index + 1}`}
										placeholder={t`Role`}
										value={participant.role}
										maxLength={200}
										onChange={(event) => setParticipant(participant.id, { role: event.target.value })}
									/>
									<IconButton
										icon="x"
										iconSize={18}
										label={t`Remove person ${index + 1}`}
										className="h-9 w-8 text-ink-2"
										onClick={() =>
											set(
												"participants",
												draft.participants.filter((item) => item.id !== participant.id),
											)
										}
									/>
									<Input
										type="url"
										dir="ltr"
										placeholder="https://..."
										aria-label={t`Profile link of person ${index + 1}`}
										id={`${id}-${participant.id}-profile`}
										{...fieldProps(`${participant.id}-profile`)}
										className="col-span-2"
										value={participant.profileUrl}
										maxLength={2048}
										onChange={(event) => setParticipant(participant.id, { profileUrl: event.target.value })}
									/>
									<FieldError id={`${id}-${participant.id}-name-error`}>{error(`${participant.id}-name`)}</FieldError>
									<FieldError id={`${id}-${participant.id}-profile-error`}>
										{error(`${participant.id}-profile`)}
									</FieldError>
								</div>
							))}
							<Button
								size="sm"
								variant="ghost"
								className="w-fit text-ink-2"
								disabled={draft.participants.length >= 20}
								onClick={() =>
									set("participants", [...draft.participants, { id: generateId(), name: "", role: "", profileUrl: "" }])
								}
							>
								<Icon name="user-plus" size={18} />
								<Trans>Add a person</Trans>
							</Button>
							<p className="type-metadata text-ink-3">
								<Trans>Profile links are saved only as interview records.</Trans>
							</p>
						</fieldset>

						<Field label={t`What they asked you to prepare`} htmlFor={`${id}-notes`}>
							<Textarea
								id={`${id}-notes`}
								rows={2}
								value={draft.notes}
								maxLength={5000}
								onChange={(event) => set("notes", event.target.value)}
							/>
						</Field>
					</form>
				</ScrollArea>

				<DialogFooter className="border-t border-line px-6 py-4">
					{editing && (
						<Button variant="ghost" className="text-danger-text" disabled={pending} onClick={deleteInterview}>
							<Icon name="trash" size={18} />
							<Trans>Delete</Trans>
						</Button>
					)}
					<span className="flex-1" />
					<DialogClose render={<Button variant="secondary" />}>
						<Trans>Cancel</Trans>
					</DialogClose>
					<Button type="submit" form={`${id}-form`} loading={pending} disabled={pending}>
						<Trans>Save interview</Trans>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type SegmentsProps<T extends string | number> = {
	label: string;
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	className?: string;
};

/** A segmented control whose raised thumb slides between choices. */
function Segments<T extends string | number>({ label, value, options, onChange, className }: SegmentsProps<T>) {
	return (
		<SegmentedControl
			data-wrap={options.length > 4}
			size="toolbar"
			aria-label={label}
			value={value}
			onValueChange={(next) => onChange(next as T)}
			className={cn("flex w-full", className)}
		>
			{options.map((option) => (
				<SegmentedControlItem key={option.value} value={option.value}>
					<span className="relative">{option.label}</span>
				</SegmentedControlItem>
			))}
		</SegmentedControl>
	);
}

type FieldProps = {
	label: string;
	htmlFor?: string;
	required?: boolean;
	error?: string | undefined;
	children: React.ReactNode;
};

function Field({ label, htmlFor, required, error, children }: FieldProps) {
	return (
		<div className="grid min-w-0 content-start gap-1.5">
			<Label htmlFor={htmlFor}>
				{label}
				{required && <span aria-hidden="true"> *</span>}
			</Label>
			{children}
			<FieldError id={`${htmlFor}-error`}>{error}</FieldError>
		</div>
	);
}
