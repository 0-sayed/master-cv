import type { ComponentProps, ReactNode } from "react";
import { useDirection } from "@base-ui/react/direction-provider";
import { cn } from "@reactive-resume/utils/style";
import { Icon } from "./icon";

type DataTableSortHeaderProps = Omit<ComponentProps<"th">, "onClick"> & {
	direction: "asc" | "desc" | false;
	onSort: () => void;
};

/** Sorting keeps the column heading's type and exposes its state on the header cell. */
export function DataTableSortHeader({ direction, onSort, children, ...props }: DataTableSortHeaderProps) {
	return (
		<th
			scope="col"
			aria-sort={direction === false ? "none" : direction === "asc" ? "ascending" : "descending"}
			{...props}
		>
			<button type="button" className="data-table-header-action data-table-sort touch-target relative" onClick={onSort}>
				{children}
				<Icon
					name={direction === false ? "arrows-down-up" : direction === "asc" ? "arrow-up" : "arrow-down"}
					className={direction === false ? "text-ink-3" : undefined}
				/>
			</button>
		</th>
	);
}

/** Data collections share typography, row rhythm, selection and direction. */
type DataTableProps = ComponentProps<"table"> & {
	columns?: readonly { key: string; className?: string }[];
};

export function DataTable({ className, columns, children, ...props }: DataTableProps) {
	const direction = useDirection();
	const layoutKey = columns ? `${direction}:${columns.map(({ key }) => key).join(",")}` : undefined;
	return (
		<table
			key={layoutKey}
			dir={direction}
			data-slot="data-table"
			className={cn(
				"data-table w-full border-collapse type-body [&_thead_th]:whitespace-nowrap",
				columns && "table-fixed",
				className,
			)}
			{...props}
		>
			{columns && (
				<colgroup>
					{columns.map(({ key, className }) => (
						<col key={key} data-column={key} className={className} />
					))}
				</colgroup>
			)}
			{children}
		</table>
	);
}

type DataTableGroupRowProps = Omit<ComponentProps<"button">, "children"> & {
	label: ReactNode;
	labelColumns: number;
	children?: ReactNode;
};

/** A native disclosure button spans the group band without replacing table semantics. */
export function DataTableGroupRow({ label, labelColumns, children, className, ...props }: DataTableGroupRowProps) {
	return (
		<tr className="data-table-group relative">
			<th scope="row" colSpan={labelColumns}>
				<button
					type="button"
					className={cn("inline-flex items-center gap-2 text-start type-label after:absolute after:inset-0", className)}
					{...props}
				>
					{label}
				</button>
			</th>
			{children}
		</tr>
	);
}
