import { useState } from "react";
import { storageKey as registeredStorageKey, browserStorage } from "@/libs/browser-storage";

const keyFor = (userId: string) => registeredStorageKey("sidebar", userId);

function read(userId: string) {
	try {
		return browserStorage.local.getItem(keyFor(userId)) === "collapsed";
	} catch {
		return false;
	}
}

/** Read synchronously before paint; account changes never inherit another user's layout. */
export function useSidebarPreference(userId: string) {
	const [selection, setSelection] = useState(() => ({ userId, collapsed: read(userId) }));
	if (selection.userId !== userId) setSelection({ userId, collapsed: read(userId) });
	const collapsed = selection.userId === userId ? selection.collapsed : read(userId);
	const toggle = () => {
		const next = !collapsed;
		try {
			browserStorage.local.setItem(keyFor(userId), next ? "collapsed" : "expanded");
		} catch {
			// Browser privacy/storage restrictions must not disable this session's control.
		}
		setSelection({ userId, collapsed: next });
	};
	return { collapsed, toggle };
}
