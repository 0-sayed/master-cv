import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
// @vitest-environment happy-dom
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { DataTable, DataTableGroupRow, DataTableSortHeader } from "./data-table";

it.each([false, "asc", "desc"] as const)("exposes sorting state %s with a persistent indicator", (direction) => {
	const onSort = vi.fn();
	render(
		<DataTable>
			<thead>
				<tr>
					<DataTableSortHeader direction={direction} onSort={onSort}>
						Updated
					</DataTableSortHeader>
				</tr>
			</thead>
		</DataTable>,
	);
	const heading = screen.getByRole("columnheader", { name: "Updated" });
	expect(heading.getAttribute("aria-sort")).toBe(
		direction === false ? "none" : direction === "asc" ? "ascending" : "descending",
	);
	const button = screen.getByRole("button", { name: "Updated" });
	expect(button.querySelector("svg")).toBeTruthy();
	button.focus();
	expect(document.activeElement).toBe(button);
	fireEvent.click(button);
	expect(onSort).toHaveBeenCalledOnce();
});

afterEach(cleanup);

it("keeps group disclosure keyboard focusable without losing aligned summary cells", () => {
	const toggle = vi.fn();
	render(
		<DataTable>
			<tbody>
				<DataTableGroupRow label="Interview 2" labelColumns={2} aria-expanded={false} onClick={toggle}>
					<td>Interview · Tuesday 10:00</td>
					<td>Today</td>
				</DataTableGroupRow>
			</tbody>
		</DataTable>,
	);
	const button = screen.getByRole("button", { name: "Interview 2" });
	button.focus();
	expect(document.activeElement).toBe(button);
	expect(button.tagName).toBe("BUTTON");
	expect(button.getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(button);
	expect(toggle).toHaveBeenCalledOnce();
	expect(screen.getByText("Interview · Tuesday 10:00").closest("td")).toBeTruthy();
});

it("shares explicit columns between the header and every row", () => {
	render(
		<DataTable columns={[{ key: "title" }, { key: "updated", className: "w-32" }]}>
			<thead>
				<tr>
					<th>Title</th>
					<th>Updated</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td>A long title</td>
					<td>Today</td>
				</tr>
			</tbody>
		</DataTable>,
	);
	expect(screen.getByRole("table").className).toContain("table-fixed");
	expect(screen.getByRole("table").className).toContain("[&_thead_th]:whitespace-nowrap");
	expect(document.querySelectorAll("col")).toHaveLength(2);
	expect(document.querySelector('col[data-column="updated"]')?.className).toBe("w-32");
});

it("keeps the column direction in sync with the shared interface direction", () => {
	const content = (
		<DataTable columns={[{ key: "title" }]}>
			<tbody>
				<tr>
					<td>Title</td>
				</tr>
			</tbody>
		</DataTable>
	);
	const view = render(<DirectionProvider direction="rtl">{content}</DirectionProvider>);
	expect(screen.getByRole("table").getAttribute("dir")).toBe("rtl");
	view.rerender(<DirectionProvider direction="ltr">{content}</DirectionProvider>);
	expect(screen.getByRole("table").getAttribute("dir")).toBe("ltr");
});
