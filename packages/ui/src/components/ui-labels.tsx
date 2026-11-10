import { createContext, useContext } from "react";

/** App-provided translations shared by portal-based controls. */
const UiLabelsContext = createContext({ close: "Close" });
export const UiLabelsProvider = UiLabelsContext.Provider;
export function useUiLabels() {
	return useContext(UiLabelsContext);
}
