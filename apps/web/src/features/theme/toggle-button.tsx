import { t } from "@lingui/core/macro";
import { startTransition } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { useTheme } from "./provider";

export function ThemeToggleButton({
	showLabel = false,
	...props
}: React.ComponentProps<typeof Button> & { showLabel?: boolean }) {
	const { resolvedTheme, toggleTheme } = useTheme();

	const onToggleTheme = () => {
		startTransition(() => {
			toggleTheme();
		});
	};

	const ariaLabel = resolvedTheme === "dark" ? t`Switch to light theme` : t`Switch to dark theme`;

	return (
		<Tooltip>
			<TooltipTrigger
				render={<Button size="icon" variant="control" onClick={onToggleTheme} aria-label={ariaLabel} {...props} />}
			>
				<Icon name={resolvedTheme === "dark" ? "moon" : "sun"} />
				{showLabel && ariaLabel}
			</TooltipTrigger>
			<TooltipContent>{ariaLabel}</TooltipContent>
		</Tooltip>
	);
}
