import { t } from "@lingui/core/macro";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { toast } from "@reactive-resume/ui/components/toast";
import { useTheme } from "./provider";

export function ThemeChoices() {
	const { theme, setTheme } = useTheme();
	const choices = [
		{ value: "light", icon: "sun", label: t({ message: "Light", context: "account.theme.light" }) },
		{ value: "dark", icon: "moon", label: t({ message: "Dark", context: "account.theme.dark" }) },
		{ value: "system", icon: "monitor", label: t`System` },
	] as const;
	return (
		<SegmentedControl
			aria-label={t`Theme`}
			value={theme}
			onValueChange={(value) => {
				if (value !== "light" && value !== "dark" && value !== "system") return;
				setTheme(value);
				toast.add({ type: "success", description: t({ message: "Saved", context: "editor.save.status.saved" }) });
			}}
		>
			{choices.map((choice) => (
				<SegmentedControlItem key={choice.value} value={choice.value} aria-label={choice.label}>
					<Icon name={choice.icon} />
					<span>{choice.label}</span>
				</SegmentedControlItem>
			))}
		</SegmentedControl>
	);
}
