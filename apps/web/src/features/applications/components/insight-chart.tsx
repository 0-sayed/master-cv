import type { ApplicationStatus } from "@reactive-resume/schema/applications/data";
import type { CSSProperties } from "react";
import { useLingui } from "@lingui/react";
import { DataTable } from "@reactive-resume/ui/components/data-table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { cn } from "@reactive-resume/utils/style";
import { insightCopy } from "../insights-copy";
import { getStageColor } from "../stages";

export function InsightBar({
	label,
	count,
	denominator,
	maximum,
	status,
	highlight = false,
}: {
	label: string;
	count: number;
	denominator: number;
	maximum: number;
	status?: ApplicationStatus;
	highlight?: boolean;
}) {
	const percentage = denominator ? `${Math.round((count / denominator) * 100)}%` : "—";
	return (
		<li className="grid min-w-0 gap-2">
			<div className="flex items-start justify-between gap-3 type-body">
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger className={cn("min-w-0 text-start type-body", highlight && "text-accent-text")}>
							<span dir="auto" className="[unicode-bidi:isolate]">
								{label}
							</span>
						</TooltipTrigger>
						<TooltipContent>
							<span dir="auto">{label}</span>
							<bdi dir="ltr">
								{count} / {denominator} ({percentage})
							</bdi>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
				<bdi dir="ltr" className="shrink-0 whitespace-nowrap text-ink tabular-nums">
					<strong>{count}</strong> · <span className="text-ink-3">{percentage}</span>
				</bdi>
			</div>
			<div aria-hidden="true" className={cn("h-2 overflow-hidden rounded-full", status ? "bg-raised" : "bg-sunken")}>
				<span
					data-slot="insight-bar-fill"
					className={cn(
						"block h-full rounded-full",
						status ? "bg-(--insight-bar-color)" : highlight ? "bg-accent" : "bg-ink-3",
					)}
					style={
						{
							width: `${maximum > 0 ? (count / maximum) * 100 : 0}%`,
							"--insight-bar-color": status ? getStageColor(status) : undefined,
						} as CSSProperties
					}
				/>
			</div>
		</li>
	);
}

export function InsightDataTable({
	caption,
	rows,
}: {
	caption: string;
	rows: readonly { label: string; count: number; denominator: number }[];
}) {
	const { i18n } = useLingui();
	return (
		<DataTable>
			<caption className="py-3 text-start type-section">{caption}</caption>
			<thead>
				<tr>
					<th scope="col">{i18n._(insightCopy.label)}</th>
					<th scope="col">{i18n._(insightCopy.count)}</th>
					<th scope="col">{i18n._(insightCopy.share)}</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row, index) => (
					<tr key={`${row.label}-${index}`}>
						<th scope="row" dir="auto" className="text-start font-normal">
							{row.label}
						</th>
						<td>
							<bdi dir="ltr" className="whitespace-nowrap tabular-nums">
								{row.count} / {row.denominator}
							</bdi>
						</td>
						<td>
							<bdi dir="ltr">{row.denominator ? `${Math.round((row.count / row.denominator) * 100)}%` : "—"}</bdi>
						</td>
					</tr>
				))}
			</tbody>
		</DataTable>
	);
}
