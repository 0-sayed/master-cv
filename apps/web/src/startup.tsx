import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { RouterProvider } from "@tanstack/react-router";
import { createRoot, type Root } from "react-dom/client";
import { ErrorScreen } from "./components/layout/error-screen";
import { LoadingScreen } from "./components/layout/loading-screen";
import { getLocale, loadUiLocale } from "./libs/locale";
import { getRouter } from "./router";

/** Session, flags, locale and the first route can fail before the router's boundary exists. */
export async function startApplication(element: HTMLElement) {
	let root: Root | undefined;
	const render = (content: React.ReactNode) => {
		root ??= createRoot(element);
		root.render(<I18nProvider i18n={i18n}>{content}</I18nProvider>);
	};
	const start = async () => {
		if (root) render(<LoadingScreen />);
		try {
			const locale = getLocale();
			await loadUiLocale(locale);
			document.documentElement.lang = locale;
			document.documentElement.dir = locale === "ar-SA" ? "rtl" : "ltr";
			const router = await getRouter();
			// Preserve a prerendered homepage until its route is ready.
			if (element.hasChildNodes()) await router.load();
			document.head
				.querySelectorAll('title, meta[name="description"], meta[name="robots"]:not([data-root-resume-shell])')
				.forEach((tag) => tag.remove());
			render(<RouterProvider router={router} />);
		} catch {
			if (!i18n.locale) i18n.loadAndActivate({ locale: "en-US", messages: {} });
			// Failed session discovery remains unknown; only a successful retry can enter the app.
			render(<ErrorScreen boot reset={() => void start()} />);
		}
	};
	await start();
}
