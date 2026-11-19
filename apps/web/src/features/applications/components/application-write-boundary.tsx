import type { ReactNode } from "react";
import { createContext, useContext } from "react";

const ReadOnlyContext = createContext(false);
export const useApplicationReadOnly = () => useContext(ReadOnlyContext);

/** Includes React portal events, so an already-open dialog cannot write stale data. */
export function ApplicationWriteBoundary({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
	return (
		<ReadOnlyContext.Provider value={readOnly}>
			<fieldset
				disabled={readOnly}
				className="contents"
				onClickCapture={(event) => {
					if (!readOnly) return;
					event.preventDefault();
					event.stopPropagation();
				}}
				onKeyDownCapture={(event) => {
					if (!readOnly || event.key === "Tab" || event.key === "Escape") return;
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
