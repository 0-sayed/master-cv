/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- Scrollable table regions need keyboard focus for horizontal scrolling. */
import type { CsvField } from "../csv";
import { t } from "@lingui/core/macro";
import { Plural, Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Label } from "@reactive-resume/ui/components/label";
import { NativeSelect } from "@reactive-resume/ui/components/native-select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@reactive-resume/ui/components/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@reactive-resume/ui/components/tabs";
import { Textarea } from "@reactive-resume/ui/components/textarea";
import { toast } from "@reactive-resume/ui/components/toast";
import { downloadWithAnchor } from "@reactive-resume/utils/file";
import { autoMapHeaders, CSV_FIELDS, mapCsvToApplications, parseCsv, rowsToCsv } from "../csv";
import { useInvalidateApplications } from "../use-application-actions";
import { orpc } from "@/libs/orpc/client";

const MAX_IMPORT = 500;
const SAMPLE =
	"Company,Role,Stage,Stage Date,Location,Salary,Source,Tags,Contact Name,Contact Email,Contact Phone\nStripe,Frontend Engineer,applied,2026-07-01,Remote,$180k,LinkedIn,remote;react,Jane Doe,jane@example.com,+1 555 0100";

const fieldLabel = (field: CsvField) =>
	({
		company: t`Company`,
		role: t`Role`,
		status: t`Stage`,
		stageEnteredAt: t`Stage date`,
		location: t`Location`,
		salary: t`Salary`,
		source: t`Source`,
		sourceUrl: t`Link`,
		jobDescription: t`Job description`,
		postingSource: t`Posting source`,
		notes: t`Notes`,
		tags: t`Tags`,
		contactName: t`Contact name`,
		contactRole: t`Contact role`,
		contactType: t`Contact label`,
		contactEmail: t`Contact email`,
		contactPhone: t`Contact phone`,
		archived: t`Archived (closes it)`,
		contacts: t`Contacts`,
	})[field];

type ImportSheetProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** File selection, column matching and explicit review share the existing CSV validation contract. */
export function ImportApplicationsSheet({ open, onOpenChange }: ImportSheetProps) {
	const invalidate = useInvalidateApplications();
	const [text, setText] = useState("");
	const [overrides, setOverrides] = useState<Record<number, CsvField | null>>({});
	const [step, setStep] = useState(1);
	const [reached, setReached] = useState(1);
	const [pasting, setPasting] = useState(false);
	const [fileName, setFileName] = useState("");
	const [fileError, setFileError] = useState("");
	const [reading, setReading] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);
	const readVersion = useRef(0);

	const table = text.trim() ? parseCsv(text) : null;
	const headers = table?.[0] ?? [];
	const mapping = autoMapHeaders(headers).map((field, index) =>
		index in overrides ? (overrides[index] ?? null) : field,
	);
	const result = table ? mapCsvToApplications(table, mapping) : null;
	const importable = result ? result.rows.slice(0, MAX_IMPORT) : [];
	const overflow = (result?.rows.length ?? 0) - importable.length;
	const errors = (result?.skipped ?? 0) + new Set(result?.invalidValues.map(({ row }) => row)).size;
	const hasRequiredColumns = mapping.includes("company") && mapping.includes("role");
	const canContinue = step === 1 ? !!table && table.length > 1 && !reading : hasRequiredColumns;
	const canImport = importable.length > 0 && !result?.invalidValues.length;
	const preview = table?.slice(1, 6).map((row, index) => ({
		row,
		number: index + 2,
		result: mapCsvToApplications([headers, row], mapping),
	}));

	const updateText = (value: string) => {
		setText(value);
		setOverrides({});
		setReached(1);
		setFileError("");
	};

	const readFile = async (file: File | undefined) => {
		if (!file) return;
		const version = ++readVersion.current;
		if (!/\.csv$/i.test(file.name)) {
			setReading(false);
			setFileError(t`Choose a .csv file.`);
			return;
		}
		setReading(true);
		setFileError("");
		try {
			const value = await file.text();
			if (version !== readVersion.current) return;
			updateText(value);
			setFileName(file.name);
			setStep(1);
		} catch {
			if (version === readVersion.current) setFileError(t`Couldn't read that file. Choose it again or paste the data.`);
		} finally {
			if (version === readVersion.current) setReading(false);
		}
	};

	const reset = () => {
		setText("");
		setOverrides({});
		setStep(1);
		setReached(1);
		setPasting(false);
		setFileName("");
		setFileError("");
		if (fileRef.current) fileRef.current.value = "";
	};

	const importMutation = useMutation({
		...orpc.applications.import.mutationOptions(),
		onSuccess: (response) => {
			invalidate();
			const skipped = result?.skipped ?? 0;
			toast.add({
				description:
					skipped > 0
						? t`Imported ${response.imported} applications. ${skipped} rows had no company or role and were skipped.`
						: t`Imported ${response.imported} applications.`,
			});
			onOpenChange(false);
		},
		onError: () => toast.add({ type: "error", description: t`Import failed. Check the CSV and try again.` }),
	});

	const downloadSkipped = () => {
		if (!result || result.skippedRows.length === 0) return;
		downloadWithAnchor(
			new Blob([rowsToCsv(headers, result.skippedRows)], { type: "text/csv" }),
			"skipped-applications.csv",
		);
	};
	const disabledReason =
		step === 1
			? t`Choose a CSV file or paste a header row and at least one application to continue.`
			: step === 2
				? t`Match both Company and Role to continue.`
				: result?.invalidValues.length
					? t`Fix the invalid values in your CSV, or go back to Match columns and leave those columns out.`
					: t`Each application needs a company and role. Go back to correct the data or column matches.`;

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!importMutation.isPending) onOpenChange(next);
			}}
			onOpenChangeComplete={(next) => {
				if (next || !importMutation.isSuccess) return;
				reset();
				importMutation.reset();
			}}
		>
			<SheetContent
				side="right"
				className="min-w-0 gap-0 data-[side=right]:sm:max-w-2xl"
				showCloseButton={!importMutation.isPending}
			>
				<SheetHeader>
					<SheetTitle>
						<Trans>Import from CSV</Trans>
					</SheetTitle>
					<SheetDescription>
						<Trans>Choose your data, check the column matches, then review before importing.</Trans>
					</SheetDescription>
				</SheetHeader>
				<Tabs
					value={step}
					onValueChange={(value) => setStep(Number(value))}
					className="min-h-0 flex-1 gap-0 overflow-hidden"
				>
					<div className="px-6 py-4">
						<TabsList variant="line" size="toolbar" aria-label={t`Import steps`} className="w-full gap-3">
							{[t`Choose file`, t`Match columns`, t`Review and import`].map((label, index) => (
								<TabsTrigger
									key={index}
									value={index + 1}
									disabled={index + 1 > reached || importMutation.isPending}
									className="min-w-0 flex-1 text-start whitespace-normal"
								>
									<span className="type-count">{index + 1}</span>
									<span>{label}</span>
								</TabsTrigger>
							))}
						</TabsList>
					</div>
					<div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 pb-6">
						<TabsContent value={1} className="grid min-w-0 content-start gap-4">
							<div
								className="flex min-h-52 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-line-2 bg-sunken p-6 text-center"
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => {
									event.preventDefault();
									void readFile(event.dataTransfer.files[0]);
								}}
							>
								<Icon name="file-arrow-up" />
								<Button variant="secondary" size="row" onClick={() => fileRef.current?.click()}>
									<Trans>Drop a CSV file here or choose a file</Trans>
								</Button>
								<p className="type-metadata text-ink-2">
									<Trans>CSV files only. Your data stays unsaved until you import.</Trans>
								</p>
								<input
									ref={fileRef}
									type="file"
									accept=".csv"
									aria-label={t`Choose a CSV file`}
									className="hidden"
									onChange={(event) => {
										void readFile(event.target.files?.[0]);
										event.target.value = "";
									}}
								/>
							</div>
							{reading && (
								<p role="status">
									<Trans>Reading file…</Trans>
								</p>
							)}
							{fileName && !reading && (
								<p className="type-body wrap-anywhere" dir="auto">
									<Trans>Selected file: {fileName}</Trans>
								</p>
							)}
							{fileError && (
								<Alert variant="error">
									<Icon name="warning-circle" />
									<AlertTitle>
										<Trans>File not loaded</Trans>
									</AlertTitle>
									<AlertDescription>{fileError}</AlertDescription>
								</Alert>
							)}
							<div className="flex flex-wrap items-center justify-between gap-3">
								<Button
									variant="link"
									size="link-touch"
									onClick={() =>
										downloadWithAnchor(new Blob([SAMPLE], { type: "text/csv" }), "sample-applications.csv")
									}
								>
									<Trans>Download sample file</Trans>
								</Button>
								<Button
									variant="ghost"
									aria-expanded={pasting}
									aria-controls="import-csv-paste"
									onClick={() => setPasting((value) => !value)}
								>
									<Trans>Paste data instead</Trans>
								</Button>
							</div>
							{pasting && (
								<div id="import-csv-paste" className="grid gap-2">
									<Label htmlFor="import-csv-text">
										<Trans>CSV data</Trans>
									</Label>
									<div dir="ltr">
										<Textarea
											id="import-csv-text"
											dir="auto"
											value={text}
											rows={8}
											className="field-sizing-fixed font-mono [direction:ltr] [unicode-bidi:normal]"
											placeholder={t`Company,Role,Stage,…`}
											onChange={(event) => {
												++readVersion.current;
												setReading(false);
												setFileName("");
												updateText(event.target.value);
											}}
										/>
									</div>
								</div>
							)}
						</TabsContent>
						<TabsContent value={2} className="grid min-w-0 content-start gap-4">
							<p className="type-body text-ink-2">
								<Trans>
									We matched columns automatically. Company and Role are required; leave out any columns you do not
									need.
								</Trans>
							</p>
							<div
								className="max-w-full overflow-x-auto rounded-lg border border-line"
								role="region"
								aria-label={t`Column matching table`}
								tabIndex={0}
							>
								<table aria-label={t`Match columns`} className="w-full text-start type-body">
									<thead className="bg-sunken type-label">
										<tr>
											<th scope="col" className="p-3 text-start">
												<Trans>CSV column</Trans>
											</th>
											<th scope="col" className="p-3 text-start">
												<Trans>Application field</Trans>
											</th>
											<th scope="col" className="p-3 text-start">
												<Trans>Sample value</Trans>
											</th>
										</tr>
									</thead>
									<tbody>
										{headers.map((header, index) => (
											<tr key={index} className="border-t border-line">
												<th scope="row" dir="auto" className="p-3 text-start font-medium">
													{header || t`(no header)`}
												</th>
												<td className="min-w-60 p-3">
													<NativeSelect
														aria-label={t`Column ${header} goes to`}
														value={mapping[index] ?? ""}
														onChange={(event) =>
															setOverrides((current) => ({
																...current,
																[index]: (event.target.value || null) as CsvField | null,
															}))
														}
													>
														<option value="">{t`Leave out`}</option>
														{CSV_FIELDS.map((field) => (
															<option key={field} value={field}>
																{field === "company" || field === "role"
																	? t`${fieldLabel(field)} (required)`
																	: fieldLabel(field)}
															</option>
														))}
													</NativeSelect>
												</td>
												<td dir="auto" className="max-w-60 p-3 wrap-anywhere">
													{table?.[1]?.[index] || "—"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</TabsContent>
						<TabsContent value={3} className="grid min-w-0 content-start gap-4">
							<p role="status" className="type-label">
								<Trans>
									{importable.length} ready, {errors} with errors
								</Trans>
							</p>

							<p className="type-metadata text-ink-2">
								<Trans>Preview of the first 5 rows. All rows are checked before import.</Trans>
							</p>
							<div
								className="max-w-full overflow-x-auto rounded-lg border border-line"
								role="region"
								aria-label={t`Preview table`}
								tabIndex={0}
							>
								<table aria-label={t`Application preview`} className="w-full text-start type-body">
									<thead className="bg-sunken type-label">
										<tr>
											<th scope="col" className="p-3 text-start">
												<Trans>Row</Trans>
											</th>

											<th scope="col" className="p-3 text-start">
												<Trans>Review</Trans>
											</th>
											{headers.map((header, index) => (
												<th scope="col" key={index} dir="auto" className="p-3 text-start">
													{header || t`(no header)`}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{preview?.map(({ row, number, result: rowResult }) => (
											<tr key={number} className="border-t border-line">
												<th scope="row" className="p-3 text-start type-count">
													{number}
												</th>

												<td className="min-w-60 p-3 align-top">
													{rowResult.skipped || rowResult.invalidValues.length ? (
														<Alert variant="warn">
															<Icon name="warning-circle" />
															<AlertTitle>
																<Trans>Check row {number}</Trans>
															</AlertTitle>
															<AlertDescription>
																{rowResult.skipped > 0 && (
																	<p>
																		<Trans>Company and role are required.</Trans>
																	</p>
																)}
																{rowResult.invalidValues.map(({ field, value }) => (
																	<p key={field}>
																		<Trans>
																			{fieldLabel(field)}: “<bdi dir="auto">{value}</bdi>” is invalid.
																		</Trans>
																	</p>
																))}
															</AlertDescription>
														</Alert>
													) : (
														<span className="text-accent-text">
															<Trans>Ready</Trans>
														</span>
													)}
												</td>
												{headers.map((_, index) => (
													<td key={index} dir="auto" className="max-w-60 min-w-32 p-3 align-top wrap-anywhere">
														{row[index] || "—"}
													</td>
												))}
											</tr>
										))}
									</tbody>
								</table>
							</div>
							{!!result?.invalidValues.length && (
								<Alert variant="warn">
									<Icon name="warning-circle" />
									<AlertTitle>
										<Trans>Invalid values in the CSV</Trans>
									</AlertTitle>
									<AlertDescription>
										<ul className="list-disc ps-4">
											{result.invalidValues.map(({ row, field, value }) => (
												<li key={`${row}:${field}`}>
													<Trans>
														Row {row}, {fieldLabel(field)}: “<bdi dir="auto">{value}</bdi>” is invalid.
													</Trans>
												</li>
											))}
										</ul>
									</AlertDescription>
								</Alert>
							)}
							{!!result?.skipped && (
								<div className="grid gap-2">
									<p className="type-metadata text-ink-2">
										<Plural
											value={result.skipped}
											one="# row has no company or role and will be skipped."
											other="# rows have no company or role and will be skipped."
										/>
									</p>
									<Button variant="link" size="link-touch" onClick={downloadSkipped}>
										<Trans>Download rows missing company or role</Trans>
									</Button>
								</div>
							)}
							{!!result?.contactsSkipped && (
								<Alert variant="warn">
									<Icon name="warning-circle" />
									<AlertTitle>
										<Trans>Some contacts will be skipped</Trans>
									</AlertTitle>
									<AlertDescription>
										<Plural
											value={result.contactsSkipped}
											one="# contact has an invalid email or no name; its application still imports."
											other="# contacts have an invalid email or no name; their applications still import."
										/>
									</AlertDescription>
								</Alert>
							)}
							{overflow > 0 && (
								<Alert variant="warn">
									<Icon name="warning-circle" />
									<AlertTitle>
										<Trans>Import limit</Trans>
									</AlertTitle>
									<AlertDescription>
										<Trans>
											Only the first {MAX_IMPORT} rows import at once, leaving out {overflow}. Split the file to import
											the rest.
										</Trans>
									</AlertDescription>
								</Alert>
							)}
						</TabsContent>
					</div>
				</Tabs>
				<SheetFooter className="border-t border-line">
					<div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
						<Button variant="secondary" disabled={importMutation.isPending} onClick={() => onOpenChange(false)}>
							<Trans>Cancel</Trans>
						</Button>
						<Button
							loading={importMutation.isPending}
							disabled={reading || (step < 3 ? !canContinue : !canImport)}
							aria-describedby={!(step < 3 ? canContinue : canImport) ? "import-csv-reason" : undefined}
							onClick={() => {
								if (step < 3 && canContinue) {
									setStep(step + 1);
									setReached(Math.max(reached, step + 1));
								} else if (step === 3 && canImport) importMutation.mutate({ items: importable });
							}}
						>
							{importMutation.isPending ? (
								<Trans>Importing…</Trans>
							) : step < 3 ? (
								<Trans>Next</Trans>
							) : (
								<Plural
									value={importable.length}
									zero="Import # applications"
									one="Import # application"
									other="Import # applications"
								/>
							)}
						</Button>
					</div>
					{!(step < 3 ? canContinue : canImport) && (
						<p id="import-csv-reason" className="type-metadata text-ink-2">
							{disabledReason}
						</p>
					)}
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
