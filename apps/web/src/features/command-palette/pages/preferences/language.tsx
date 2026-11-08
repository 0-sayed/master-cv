import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { CommandItem } from "@reactive-resume/ui/components/command";
import { toast } from "@reactive-resume/ui/components/toast";
import { productUiLocales } from "@reactive-resume/utils/locale";
import { BaseCommandGroup } from "../base";
import { useUiLocale } from "@/features/locale/provider";
import { localeMap } from "@/libs/locale";

export function LanguageCommandPage() {
	const { i18n } = useLingui();
	const { pending, changeLocale } = useUiLocale();

	return (
		<BaseCommandGroup page="language" heading={<Trans>Language</Trans>}>
			{productUiLocales.map((value) => (
				<CommandItem
					key={value}
					disabled={pending}
					onSelect={() =>
						void changeLocale(value).catch(() =>
							toast.add({ type: "error", description: t`Something went wrong. Please try again.` }),
						)
					}
				>
					<span className="font-mono text-xs text-ink-3">{value}</span>
					{i18n.t(localeMap[value])}
				</CommandItem>
			))}
		</BaseCommandGroup>
	);
}
