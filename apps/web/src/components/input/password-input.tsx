import { t } from "@lingui/core/macro";
import { useToggle } from "usehooks-ts";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Input } from "@reactive-resume/ui/components/input";
import { cn } from "@reactive-resume/utils/style";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & { embedded?: boolean };

export function PasswordInput({ embedded = false, className, ...props }: PasswordInputProps) {
	const [visible, toggleVisible] = useToggle(false);

	return (
		<div className={embedded ? "relative" : "flex items-center gap-x-1.5"}>
			<Input
				{...props}
				className={cn(embedded && "h-12 pr-4 pl-12 text-left font-normal", className)}
				type={visible ? "text" : "password"}
			/>

			<Button
				size="icon"
				variant="ghost"
				className={embedded ? "absolute top-0.5 left-0.5 size-11" : undefined}
				type="button"
				onClick={toggleVisible}
				aria-pressed={visible}
				aria-label={
					visible
						? t({
								comment: "Accessible label for button that hides a visible password",
								message: "Hide password",
							})
						: t({
								comment: "Accessible label for button that reveals a masked password",
								message: "Show password",
							})
				}
			>
				<Icon
					name={embedded ? (visible ? "eye-slash" : "eye") : visible ? "eye" : "eye-slash"}
					size={embedded ? 20 : 16}
				/>
			</Button>
		</div>
	);
}
