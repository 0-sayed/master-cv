import type { Application } from "../types";
import type { SingleComboboxProps } from "@/components/ui/combobox";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getStageColor, getStageLabel } from "../stages";
import { Combobox } from "@/components/ui/combobox";
import { formatRelativeTime } from "@/libs/locale";

// Hide a bare legacy UUID, but preserve identifiers within actual company names.
export const applicationCompany = (company: string) =>
	company.trim().replace(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu, "");

type ApplicationPickerProps = Omit<SingleComboboxProps, "options"> & {
	applications: Application[];
	noneLabel?: string;
};

/** Offer active jobs, retaining a linked closed job or closed jobs when none are active. */
export function ApplicationPicker({ applications, noneLabel, ...props }: ApplicationPickerProps) {
	const { i18n } = useLingui();
	const hasActive = applications.some((item) => item.status !== "closed");
	const choices = applications
		.filter(
			(item) => item.status !== "closed" || item.id === props.value || item.id === props.defaultValue || !hasActive,
		)
		.toSorted((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
	return (
		<Combobox
			placeholder={t`Choose an application…`}
			emptyMessage={t`No results found.`}
			{...props}
			defaultValue={props.defaultValue ?? (noneLabel ? "" : null)}
			onValueChange={(value) => props.onValueChange?.(value || null)}
			options={[
				...choices.map((item) => {
					const company = applicationCompany(item.company);
					const stage = getStageLabel(item.status);
					return {
						value: item.id,
						textValue: [item.role, company].filter(Boolean).join(" · "),
						keywords: [item.role, company, stage],
						label: (
							<span className="grid min-w-0 gap-1 text-start">
								<span dir="auto" className="type-body font-medium wrap-anywhere">
									{item.role}
								</span>
								{company && (
									<span dir="auto" className="type-metadata wrap-anywhere text-ink-3">
										{company}
									</span>
								)}
								<span className="flex flex-wrap items-center gap-2 type-metadata text-ink-3">
									<span className="inline-flex items-center gap-1">
										<span
											data-slot="stage-dot"
											aria-hidden="true"
											className="size-1.5 shrink-0 rounded-full"
											style={{ background: getStageColor(item.status) }}
										/>
										{stage}
									</span>
									<time dateTime={new Date(item.updatedAt).toISOString()}>
										{formatRelativeTime(item.updatedAt, i18n.locale)}
									</time>
								</span>
							</span>
						),
					};
				}),
				...(noneLabel ? [{ value: "", label: noneLabel, textValue: noneLabel }] : []),
			]}
		/>
	);
}
