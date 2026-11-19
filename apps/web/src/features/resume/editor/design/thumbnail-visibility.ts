import { createContext } from "react";

/** Kept-mounted Design controls must not render PDFs while their panel is hidden. */
export const TemplateThumbnailVisibility = createContext(false);
