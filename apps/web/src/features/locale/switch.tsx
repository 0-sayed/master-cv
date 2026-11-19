import { useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";
import { Alert, AlertActions, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useUiLocale } from "./provider";
import { QuerySkeleton } from "@/components/query-skeleton";

type LocaleSwitchProps = { compact?: boolean; presentation?: "toggle" | "choices" };

/** Target language is explicit; switching never changes document content. */
export function LocaleSwitch({ compact = false, presentation = "toggle" }: LocaleSwitchProps) {
	const { t } = useLingui();
	const { locale, pending, changeLocale } = useUiLocale();
	const [failed, setFailed] = useState(false);
	const arabic = locale === "ar-SA";
	const [retryLocale, setRetryLocale] = useState(locale);
	const choices = useRef<Partial<Record<typeof locale, HTMLButtonElement | null>>>({});
	function change(value: typeof locale) {
		if (pending || value === locale) return;
		setRetryLocale(value);
		setFailed(false);
		void changeLocale(value).catch(() => setFailed(true));
	}
	if (presentation === "choices")
		return (
			<div className="grid min-w-0 gap-3">
				<div
					role="group"
					aria-label={t({ message: "Interface language", context: "language.interface.label" })}
					className="flex flex-wrap items-center gap-1"
				>
					<Icon name="globe" size={18} className="text-ink-3" />
					{(
						[
							{ value: "ar-SA", name: "العربية", dir: "rtl" },
							{ value: "en-US", name: "English", dir: "ltr" },
						] as const
					).map((language) => (
						<Button
							key={language.value}
							ref={(button) => {
								choices.current[language.value] = button;
							}}
							lang={language.value}
							dir={language.dir}
							variant={language.value === locale ? "secondary" : "quiet"}
							aria-pressed={language.value === locale}
							disabled={pending}
							onClick={() => change(language.value)}
						>
							{language.name}
						</Button>
					))}
				</div>
				{pending && <QuerySkeleton inline shape="badge" label={t`Loading`} />}
				{failed && (
					<Alert variant="error">
						<Icon name="warning" />
						<AlertTitle>{t({ message: "Interface language", context: "language.interface.label" })}</AlertTitle>
						<AlertDescription>{t`Something went wrong. Please try again.`}</AlertDescription>
						<AlertActions>
							<Button
								variant="secondary"
								disabled={pending}
								onClick={() => {
									choices.current[retryLocale]?.focus();
									change(retryLocale);
								}}
							>{t`Retry`}</Button>
						</AlertActions>
					</Alert>
				)}
			</div>
		);
	return (
		<div className="relative">
			<Button
				dir="ltr"
				variant="control"
				size={compact ? "language-compact" : "language"}
				className="gap-1.5"
				disabled={pending}
				loading={pending}
				aria-label={
					arabic
						? t({ message: "Switch interface to English", context: "language.switch.englishAccessible" })
						: t({ message: "Switch interface to Arabic", context: "language.switch.arabicAccessible" })
				}
				onClick={() => {
					setFailed(false);
					void changeLocale(arabic ? "en-US" : "ar-SA").catch(() => setFailed(true));
				}}
			>
				{!compact && <Icon name="globe" size={18} className="hidden lg:inline-block" />}
				<span lang="en-US">
					{arabic
						? t({ message: "EN", context: "language.switch.english" })
						: t({ message: "Arabic", context: "language.switch.arabic" })}
				</span>
			</Button>
			{failed && (
				<p
					role="alert"
					className="absolute inset-e-0 z-40 min-w-48 rounded-lg border border-danger bg-raised p-3 text-danger-text"
				>{t`Something went wrong. Please try again.`}</p>
			)}
		</div>
	);
}
