import { t } from "@lingui/core/macro";
import { useToggle } from "usehooks-ts";
import { Icon } from "@reactive-resume/ui/components/icon";
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
	return (
		<InputGroup size={embedded ? "lg" : "default"} dir={embedded ? "ltr" : undefined}>
			<InputGroupInput dir="ltr" {...props} className={className} type={visible ? "text" : "password"} />
			<InputGroupAddon align={embedded ? "inline-start" : "inline-end"}>
				<InputGroupButton {...toggleProps} size="icon-lg" disabled={props.disabled}>
					<Icon name={visible ? "eye-slash" : "eye"} />
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}
