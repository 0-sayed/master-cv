import { useSyncExternalStore } from "react";

const getDevicePixelRatio = () => window.devicePixelRatio || 1;

const subscribe = (onChange: () => void) => {
	let query: MediaQueryList;
	const watch = () => {
		query?.removeEventListener("change", update);
		query = window.matchMedia(`(resolution: ${getDevicePixelRatio()}dppx)`);
		query.addEventListener("change", update);
	};
	const update = () => {
		watch();
		onChange();
	};
	watch();
	return () => query.removeEventListener("change", update);
};

export const useDevicePixelRatio = () => useSyncExternalStore(subscribe, getDevicePixelRatio, () => 1);
