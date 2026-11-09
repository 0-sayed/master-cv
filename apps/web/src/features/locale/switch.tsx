import { t } from "@lingui/core/macro";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { useUiLocale } from "./provider";

type LocaleSwitchProps = { compact?: boolean };

/** Target language is explicit; switching never changes document content. */
export function LocaleSwitch({ compact = false }: LocaleSwitchProps) {
	const { locale, pending, changeLocale } = useUiLocale();
	const [failed, setFailed] = useState(false);
	const arabic = locale === "ar-SA";
	return (
		<div className="relative">
			<Button
				dir="ltr"
				variant="secondary"
				className={cn(
					"h-12 min-h-12 w-[52px] shrink-0 gap-1.5 rounded-md border-line bg-raised px-0 py-0 text-sm font-semibold",
					!compact && "lg:h-11 lg:min-h-11 lg:w-auto lg:px-3",
				)}
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
				<span lang={arabic ? "en-US" : "ar-SA"}>
					{arabic
						? t({ message: "EN", context: "language.switch.english" })
						: t({ message: "عربي", context: "language.switch.arabic" })}
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
