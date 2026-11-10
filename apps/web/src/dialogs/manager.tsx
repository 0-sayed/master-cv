import type { DialogSchema } from "./schemas";
import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Fragment, useEffect, useState } from "react";
import { Alert } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@reactive-resume/ui/components/dialog";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { TaskOverlay, TaskOverlayContent, TaskOverlayTitle } from "@reactive-resume/ui/components/task-overlay";
import { useDialogStore } from "./store";

type Renderers = { renderDialog: (dialog: DialogSchema) => ReactNode };

// The forms stay out of every page's bundle. Keep a dismissible overlay visible while their first-open chunk loads.
export function DialogManager() {
	const { open, activeDialog, openCount, onOpenChange } = useDialogStore();
	const [renderers, setRenderers] = useState<Renderers | null>(null);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const hasDialog = activeDialog !== null;
	const isTask = activeDialog?.type === "auth.change-password";
	const Root = isTask ? TaskOverlay : Dialog;
	const Content = isTask ? TaskOverlayContent : DialogContent;
	const Title = isTask ? TaskOverlayTitle : DialogTitle;

	useEffect(() => {
		if (!hasDialog || renderers) return;
		let current = true;
		void import("./renderers").then(
			(module) => {
				if (current) setRenderers(module);
			},
			() => {
				if (current) setFailed(true);
			},
		);
		return () => {
			current = false;
		};
	}, [hasDialog, renderers, attempt]);

	return (
		<Root open={open} onOpenChange={onOpenChange}>
			{activeDialog &&
				(renderers ? (
					<Fragment key={openCount}>{renderers.renderDialog(activeDialog)}</Fragment>
				) : (
					<Content closeLabel={t`Close`} aria-busy={!failed}>
						<Title>{failed ? t`Something went wrong` : t`Loading workspace…`}</Title>
						{failed ? (
							<>
								<Alert variant="error">{t`Something went wrong`}</Alert>
								<Button
									onClick={() => {
										setFailed(false);
										setAttempt((value) => value + 1);
									}}
								>{t`Retry`}</Button>
							</>
						) : (
							<div role="status" aria-label={t`Loading workspace…`}>
								<Spinner decorative />
							</div>
						)}
					</Content>
				))}
		</Root>
	);
}
