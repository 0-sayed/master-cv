// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { createPortal } from "react-dom";
import { Button } from "@reactive-resume/ui/components/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@reactive-resume/ui/components/dialog";
import { ApplicationWriteBoundary } from "./application-write-boundary";
afterEach(cleanup);
it("blocks portal writes but permits pointer and keyboard dismissal", () => {
	const write = vi.fn();
	const dismiss = vi.fn();
	render(
		<ApplicationWriteBoundary readOnly>
			<Dialog open onOpenChange={dismiss}>
				<DialogContent>
					<DialogTitle>Edit</DialogTitle>
					<Button onClick={write}>Save</Button>
					<DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
				</DialogContent>
			</Dialog>
			{createPortal(
				<form onSubmit={write}>
					<Button type="submit">Submit</Button>
				</form>,
				document.body,
			)}
		</ApplicationWriteBoundary>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	const form = screen.getByRole("button", { name: "Submit", hidden: true }).closest("form");
	if (!form) throw new Error("Expected a form");
	fireEvent.submit(form);
	expect(write).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	expect(dismiss).toHaveBeenCalledWith(false, expect.anything());
	fireEvent.click(screen.getByRole("button", { name: "Close" }));
	expect(dismiss).toHaveBeenCalledTimes(2);
});
