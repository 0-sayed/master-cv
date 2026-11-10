import { t } from "@lingui/core/macro";
import { useToggle } from "usehooks-ts";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
	InputGroupButton,
} from "@reactive-resume/ui/components/input-group";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & { embedded?: boolean };

export function PasswordInput({ embedded = false, className, ...props }: PasswordInputProps) {
	const [visible, toggleVisible] = useToggle(false);

	const toggleProps = {
		type: "button" as const,
		onClick: toggleVisible,
		"aria-pressed": visible,
		"aria-label": visible
			? t({ comment: "Accessible label for button that hides a visible password", message: "Hide password" })
			: t({ comment: "Accessible label for button that reveals a masked password", message: "Show password" }),
	};
	if (embedded)
		return (
			<InputGroup size="lg" dir="ltr">
				<InputGroupInput dir="ltr" {...props} className={className} type={visible ? "text" : "password"} />
				<InputGroupAddon align="inline-start">
					<InputGroupButton {...toggleProps} size="icon-lg">
						<Icon name={visible ? "eye-slash" : "eye"} size={20} />
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		);
	return (
		<div className="flex items-center gap-x-1.5">
			<Input dir="ltr" {...props} className={className} type={visible ? "text" : "password"} />

			<Button size="toolbar-icon" variant="ghost" {...toggleProps}>
				<Icon name={visible ? "eye" : "eye-slash"} size={16} />
			</Button>
		</div>
	);
}
