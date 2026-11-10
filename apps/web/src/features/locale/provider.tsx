import type { AuthSession } from "@reactive-resume/auth/types";
import type { UiLocale } from "@reactive-resume/utils/locale";
import type { PropsWithChildren } from "react";
import { DirectionProvider } from "@base-ui/react/direction-provider";
import { i18n } from "@lingui/core";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import Cookies from "js-cookie";
import { createContext, use, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createLocaleSwitchQueue } from "./switch-queue";
import { authClient } from "@/libs/auth/client";
import { getUiLocaleMessages } from "@/libs/locale";
import { sessionQueryKey } from "@/libs/root-context";
import { loadUiFonts } from "@/libs/ui-fonts";

type LocaleContextValue = { locale: UiLocale; pending: boolean; changeLocale: (value: UiLocale) => Promise<void> };
const LocaleContext = createContext<LocaleContextValue | null>(null);
type LocaleProviderProps = PropsWithChildren<{
	locale: UiLocale;
	session: { user: Pick<AuthSession["user"], "id"> } | null;
}>;

export function LocaleProvider({ children, locale: initialLocale, session }: LocaleProviderProps) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const accountId = session?.user.id;
	const [selection, setSelection] = useState({ initialLocale, accountId, value: initialLocale });
	if (selection.initialLocale !== initialLocale || selection.accountId !== accountId) {
		setSelection({ initialLocale, accountId, value: initialLocale });
	}
	const locale = selection.value;
	const [requests, setRequests] = useState({ accountId, generation: Symbol(), count: 0 });
	if (requests.accountId !== accountId) {
		setRequests({ accountId, generation: Symbol(), count: 0 });
	}
	const queue = useRef<ReturnType<typeof createLocaleSwitchQueue> | null>(null);
	const restoreFocus = useRef<HTMLElement | null>(null);
	useLayoutEffect(() => {
		if (requests.count !== 0) return;
		if (restoreFocus.current?.isConnected && document.activeElement === document.body) {
			restoreFocus.current.focus({ preventScroll: true });
		}
		restoreFocus.current = null;
	}, [requests]);
	useEffect(() => {
		const respectFocusChoice = (event: FocusEvent) => {
			if (event.target !== restoreFocus.current && event.target !== document.body) restoreFocus.current = null;
		};
		document.addEventListener("focusin", respectFocusChoice);
		return () => document.removeEventListener("focusin", respectFocusChoice);
	}, []);
	useEffect(() => {
		document.documentElement.lang = locale;
		document.documentElement.dir = locale === "ar-SA" ? "rtl" : "ltr";
	}, [locale]);
	useLayoutEffect(() => {
		let current = true;
		queue.current = createLocaleSwitchQueue(async (value) => {
			const isCurrentAccount = () => current;
			if (!isCurrentAccount()) throw new Error("Session changed");
			const [catalog] = await Promise.all([getUiLocaleMessages(value), loadUiFonts(value)]);
			if (!isCurrentAccount()) throw new Error("Session changed");
			if (accountId) {
				const { error } = await authClient.updateUser({ uiLocale: value });
				if (error) throw new Error("Locale preference could not be saved");
				if (!isCurrentAccount()) throw new Error("Session changed");
				queryClient.setQueryData<AuthSession | null>(sessionQueryKey, (cached) =>
					cached?.user.id === accountId ? { ...cached, user: { ...cached.user, uiLocale: value } } : cached,
				);
			}
			Cookies.set("locale", value);
			i18n.loadAndActivate(catalog);
			setSelection((previous) => ({ ...previous, value }));
			router.update({ context: { ...router.options.context, locale: value } });
			const url = new URL(router.state.location.href, window.location.origin);
			url.searchParams.set("locale", value);
			await router.navigate({
				href: `${url.pathname}${url.search}${url.hash}`,
				state: true,
				replace: true,
				resetScroll: false,
				hashScrollIntoView: false,
				viewTransition: false,
				ignoreBlocker: true,
			});
		});
		return () => {
			current = false;
			queue.current = null;
			restoreFocus.current = null;
		};
	}, [router, queryClient, accountId]);

	async function changeLocale(value: UiLocale) {
		const generation = requests.generation;
		restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setRequests((previous) =>
			previous.generation === generation ? { ...previous, count: previous.count + 1 } : previous,
		);
		try {
			if (!queue.current) throw new Error("Locale session is unavailable");
			await queue.current(value);
		} finally {
			setRequests((previous) =>
				previous.generation === generation ? { ...previous, count: previous.count - 1 } : previous,
			);
		}
	}
	return (
		<LocaleContext value={{ locale, pending: requests.count > 0, changeLocale }}>
			<DirectionProvider direction={locale === "ar-SA" ? "rtl" : "ltr"}>{children}</DirectionProvider>
		</LocaleContext>
	);
}

export function useUiLocale() {
	const value = use(LocaleContext);
	if (!value) throw new Error("useUiLocale must be used within LocaleProvider");
	return value;
}
