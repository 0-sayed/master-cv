import type { SingleComboboxProps } from "@/components/ui/combobox";
import { t } from "@lingui/core/macro";
import { useState } from "react";
import { isUiLocale } from "@reactive-resume/utils/locale";
import { getUiLocaleOptions } from "./locale-options";
import { useUiLocale } from "./provider";
import { Combobox } from "@/components/ui/combobox";

type Props = Omit<SingleComboboxProps, "options" | "value" | "onValueChange">;

export function LocaleCombobox(props: Props) {
	const { locale, pending, changeLocale } = useUiLocale();
	const [failed, setFailed] = useState(false);

	return (
		<div className="grid gap-1.5">
			<Combobox
				showClear={false}
				value={locale}
				options={getUiLocaleOptions()}
				{...props}
				disabled={pending || !!props.disabled}
				onValueChange={(value) => {
					if (!isUiLocale(value)) return;
					setFailed(false);
					void changeLocale(value).catch(() => setFailed(true));
				}}
			/>
			{failed && <p role="alert" className="text-sm text-danger">{t`Something went wrong. Please try again.`}</p>}
		</div>
	);
}
