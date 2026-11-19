import type { ReactNode } from "react";
import { createContext, useContext } from "react";

const ReadOnlyContext = createContext(false);
export const useApplicationReadOnly = () => useContext(ReadOnlyContext);
const isDismissal = (target: EventTarget | null) =>
	target instanceof Element &&
	Boolean(
		target.closest(
			'[data-slot="dialog-close"], [data-slot="sheet-close"], [data-slot="dialog-overlay"], [data-slot="sheet-overlay"]',
		),
	);

/** Includes React portal events, so an already-open dialog cannot write stale data. */
export function ApplicationWriteBoundary({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
	return (
		<ReadOnlyContext.Provider value={readOnly}>
			<fieldset
				disabled={readOnly}
				className="contents"
				onClickCapture={(event) => {
					if (!readOnly || isDismissal(event.target)) return;
					event.preventDefault();
					event.stopPropagation();
				}}
				onKeyDownCapture={(event) => {
					if (!readOnly || event.key === "Tab" || event.key === "Escape" || isDismissal(event.target)) return;
					event.preventDefault();
					event.stopPropagation();
				}}
				onSubmitCapture={(event) => {
					if (!readOnly) return;
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				{children}
			</fieldset>
		</ReadOnlyContext.Provider>
	);
}
