import type { ApplicationExportOptions } from "../csv";
import type { Application } from "../types";
import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { useId, useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { FieldError } from "@reactive-resume/ui/components/field-error";
import { Label } from "@reactive-resume/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { useSubmitValidation } from "@reactive-resume/ui/hooks/use-submit-validation";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { exportApplicationsCsv, selectApplicationsForExport } from "../csv";
import { CalendarDateInput } from "@/components/input/calendar-date-input";
import { Combobox } from "@/components/ui/combobox";

type ExportApplicationsSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	applications: Application[];
	filtered: Application[];
};

export function ExportApplicationsSheet({ open, onOpenChange, applications, filtered }: ExportApplicationsSheetProps) {
	const id = useId();
	const [scope, setScope] = useState<ApplicationExportOptions["scope"]>("filtered");
	const [from, setFrom] = useState("");
	const [to, setTo] = useState("");
	const validRange = !from || !to || from <= to;
	const selected = selectApplicationsForExport(applications, filtered, { scope, from, to });

	const validation = useSubmitValidation({
		[`${id}-from`]: !validRange ? t`Start date must be on or before end date.` : undefined,
		[`${id}-scope`]: !selected.length ? t`No applications match. Change the filters or date range.` : undefined,
	});
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="right" className="w-full gap-0 data-[side=right]:sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>
						<Trans>Export applications</Trans>
					</SheetTitle>
					<SheetDescription>
						<Trans>Download application details, contacts, notes, and timeline history as CSV.</Trans>
					</SheetDescription>
				</SheetHeader>
				<form
					noValidate
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						if (!validation.validate()) return;
						const blob = new Blob([exportApplicationsCsv(selected)], { type: "text/csv;charset=utf-8" });
						downloadWithAnchor(blob, `applications-${new Date().toISOString().slice(0, 10)}.csv`);
						onOpenChange(false);
					}}
				>
					<div className="-mt-1 flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1 pb-4">
						<div className="space-y-1.5">
							<Label htmlFor={`${id}-scope`}>
								<Trans>Applications to export</Trans>
							</Label>
							<Combobox
								id={`${id}-scope`}
								aria-invalid={!!validation.errors[`${id}-scope`]}
								aria-describedby={`${id}-scope-error`}
								className="w-full"
								value={scope}
								onValueChange={(value) => value && setScope(value)}
								options={[
									{ value: "filtered", label: t`Current filters` },
									{ value: "all", label: t`All applications (including closed)` },
								]}
							/>
						</div>
						<FieldError id={`${id}-scope-error`}>{validation.errors[`${id}-scope`]}</FieldError>
						<div className="grid grid-cols-2 items-end gap-3">
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-from`}>
									<Trans>Application date from</Trans>
								</Label>
								<CalendarDateInput
									id={`${id}-from`}
									label={t`Application date from`}
									aria-invalid={!!validation.errors[`${id}-from`]}
									aria-describedby={`${id}-from-error`}
									value={from}
									max={to || undefined}
									onChange={setFrom}
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-to`}>
									<Trans>Application date to</Trans>
								</Label>
								<CalendarDateInput
									id={`${id}-to`}
									label={t`Application date to`}
									value={to}
									min={from || undefined}
									onChange={setTo}
								/>
							</div>
						</div>
						<FieldError id={`${id}-from-error`}>{validation.errors[`${id}-from`]}</FieldError>
						<p className="type-body text-ink-3">
							<Plural value={selected.length} one="# application to export" other="# applications to export" />
						</p>
					</div>
					<SheetFooter className="flex-row justify-end gap-2">
						<Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button type="submit">
							<Trans>Download CSV</Trans>
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
