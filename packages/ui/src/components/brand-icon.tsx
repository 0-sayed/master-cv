import { cn } from "@reactive-resume/utils/style";

type Props = React.ComponentProps<"img"> & {
	variant?: "logo" | "icon";
};

export function BrandIcon({ variant = "logo", className, alt, ...props }: Props) {
	const mark = (
		<>
			<img
				src={"/master-cv/dark.svg"}
				alt={alt ?? (variant === "icon" ? "Master CV" : "")}
				className={cn("hidden size-8 shrink-0 object-contain dark:block", className)}
				{...props}
			/>
			<img
				src={"/master-cv/light.svg"}
				alt={alt ?? (variant === "icon" ? "Master CV" : "")}
				className={cn("block size-8 shrink-0 object-contain dark:hidden", className)}
				{...props}
			/>
		</>
	);
	if (variant === "icon") return mark;
	return (
		<span dir="ltr" className="inline-flex shrink-0 items-center gap-2 py-1.5">
			{mark}
			<span
				lang="en"
				className="text-[19px] leading-7 font-semibold whitespace-nowrap"
				style={{ fontFamily: '"Noto Sans", sans-serif' }}
			>
				Master CV
			</span>
		</span>
	);
}
