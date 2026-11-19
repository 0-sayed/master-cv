import type { ButtonProps } from "@reactive-resume/ui/components/button";
import type { IconName } from "@reactive-resume/ui/components/icon";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Kbd } from "@reactive-resume/ui/components/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@reactive-resume/ui/components/tooltip";
import { useUiLabels } from "./ui-labels";

type IconButtonProps = Omit<ButtonProps, "children" | "aria-label"> & {
	icon: IconName;
	/** Accessible name, also shown in the tooltip. */
	label: string;
	/** Platform-independent hotkey notation shown in the tooltip, e.g. "Mod+Z". */
	shortcut?: string;
	iconSize?: number;
	tooltipSide?: "top" | "bottom" | "left" | "right";
};

/** Icon-only buttons (back, close, more, undo, history, assistant, zoom) always carry a name and a tooltip. */
function IconButton({
	icon,
	label: providedLabel,
	shortcut,
	iconSize,
	tooltipSide = "bottom",
	variant = "ghost",
	size = "icon",
	...props
}: IconButtonProps) {
	const labels = useUiLabels();
	const more = icon === "dots-three" || icon === "dots-three-vertical";
	const label = more ? (labels.moreActions ?? "More actions") : providedLabel;
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button {...props} variant={more ? "ghost" : variant} size={more ? "icon-sm" : size} aria-label={label} />
				}
			>
				<Icon name={icon} size={iconSize} />
			</TooltipTrigger>
			<TooltipContent side={tooltipSide}>
				{label}
				{shortcut && <Kbd keys={shortcut} />}
			</TooltipContent>
		</Tooltip>
	);
}

export { IconButton, type IconButtonProps };
