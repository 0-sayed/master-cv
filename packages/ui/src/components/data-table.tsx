import type { ComponentProps } from "react";
import { cn } from "@reactive-resume/utils/style";

/** Data collections share typography, row rhythm, selection and direction. */
export function DataTable({ className, ...props }: ComponentProps<"table">) {
	return (
		<table data-slot="data-table" className={cn("data-table w-full border-collapse type-body", className)} {...props} />
	);
}
