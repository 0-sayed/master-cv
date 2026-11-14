import { useState } from "react";
import { browserStorage, storageKey } from "@/libs/browser-storage";
/** UI preference only, scoped to the signed-in user; no CV content is stored. */
export function useCheckIntroduction(ownerId: string | undefined) {
	const key = storageKey("checkIntroduction", ownerId ?? "anonymous");
	const [dismissed, setDismissed] = useState<string | null>(null);
	let saved = false;
	try {
		saved = browserStorage.local.getItem(key) === "dismissed";
	} catch {
		/* Storage may be disabled. */
	}
	return {
		introduced: dismissed === key || saved,
		setIntroduced: (value: boolean) => {
			setDismissed(value ? key : null);
			try {
				if (value) browserStorage.local.setItem(key, "dismissed");
				else browserStorage.local.removeItem(key);
			} catch {
				/* Dismissal still works for this mounted view. */
			}
		},
	};
}
