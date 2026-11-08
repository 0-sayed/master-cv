import { cn } from "@reactive-resume/utils/style";

type Props = React.ComponentProps<"img"> & {
	variant?: "logo" | "icon";
};

export function BrandIcon({ variant: _variant = "logo", className, ...props }: Props) {
	return (
		<>
			<img
				src={"/master-cv/dark.svg"}
				alt="Master CV"
				className={cn("hidden size-12 dark:block", className)}
				{...props}
			/>
			<img
				src={"/master-cv/light.svg"}
				alt="Master CV"
				className={cn("block size-12 dark:hidden", className)}
				{...props}
			/>
		</>
	);
}
