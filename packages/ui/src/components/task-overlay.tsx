import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";
import { cn } from "@reactive-resume/utils/style";
import { useBreakpoint } from "../hooks/use-breakpoint";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription } from "./dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "./sheet";

const TaskOverlayContext = createContext(false);
/** Reuse existing modal primitives, including their focus, escape and dismissal behavior. */
export function TaskOverlay(props: {
	open?: boolean;
	onOpenChange?: (open: boolean, eventDetails: { cancel: () => void }) => void;
	children?: ReactNode;
}) {
	const mobile = useBreakpoint() === "mobile";
	return (
		<TaskOverlayContext.Provider value={mobile}>
			{mobile ? <Sheet {...props} /> : <Dialog {...props} />}
		</TaskOverlayContext.Provider>
	);
}
export function TaskOverlayContent({
	className,
	...props
}: ComponentProps<"div"> & { showCloseButton?: boolean; closeLabel?: string }) {
	const mobile = useContext(TaskOverlayContext);
	return mobile ? (
		<SheetContent
			side="bottom"
			className={cn(
				"overflow-y-auto overscroll-contain p-6 pb-[max(var(--space-24),env(safe-area-inset-bottom))]",
				className,
			)}
			{...props}
		/>
	) : (
		<DialogContent className={className} {...props} />
	);
}
export function TaskOverlayHeader(props: ComponentProps<typeof DialogHeader>) {
	return <DialogHeader {...props} />;
}
export function TaskOverlayFooter(props: ComponentProps<typeof DialogFooter>) {
	return <DialogFooter {...props} />;
}
export function TaskOverlayTitle(props: ComponentProps<typeof DialogTitle>) {
	return useContext(TaskOverlayContext) ? <SheetTitle {...props} /> : <DialogTitle {...props} />;
}
export function TaskOverlayDescription(props: ComponentProps<typeof DialogDescription>) {
	return useContext(TaskOverlayContext) ? <SheetDescription {...props} /> : <DialogDescription {...props} />;
}
