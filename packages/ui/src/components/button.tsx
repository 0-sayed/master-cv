import type { VariantProps } from "class-variance-authority";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva } from "class-variance-authority";
import { Spinner } from "@reactive-resume/ui/components/spinner";
import { cn } from "@reactive-resume/utils/style";
import { controlHeights } from "./control-size";

const buttonVariants = cva(
	"group/button touch-target relative inline-flex max-w-full shrink-0 items-center justify-center gap-2 border border-transparent type-label whitespace-normal transition-[background-color,border-color,color,filter,scale] duration-quick ease-enter select-none disabled:pointer-events-none aria-busy:cursor-progress pointer-coarse:min-h-12 pointer-coarse:min-w-12 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			disclosure: {
				hover: "group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0",
			},
			variant: {
				"sidebar-toggle": "border-0 text-on-brand hover:text-on-brand",
				control:
					"border-line bg-raised text-ink hover:bg-sunken active:bg-press disabled:text-ink-3 aria-expanded:bg-sunken",
				primary: "bg-accent font-semibold text-on-accent hover:bg-accent-hover disabled:bg-sunken disabled:text-ink-3",
				secondary:
					"border-line-2 bg-surface text-ink hover:bg-sunken active:bg-press disabled:border-line disabled:text-ink-3 aria-expanded:bg-sunken",
				ghost: "text-ink hover:bg-hover active:bg-press disabled:text-ink-3 aria-expanded:bg-hover",
				danger:
					"bg-danger text-on-danger hover:brightness-[0.92] focus-visible:outline-danger disabled:bg-sunken disabled:text-ink-3",
				"metadata-link": "h-auto! border-0 px-0! type-metadata text-ink-3 underline-offset-4 hover:underline",
				link: "h-auto! border-0 px-0! text-accent-text underline-offset-4 hover:underline",
			},
			size: {
				"sidebar-toggle": "size-10 rounded-full p-2 pointer-coarse:min-h-10 pointer-coarse:min-w-10",
				default: `${controlHeights.default} rounded-md px-3 py-0`,
				sm: `${controlHeights.sm} gap-1.5 rounded-sm px-3`,
				lg: `${controlHeights.lg} rounded-lg px-4 py-0`,
				"link-touch": "min-h-12 rounded-md px-0 py-0",
				"link-compact": "rounded-md px-0 py-0",
				chip: "h-auto min-h-7 rounded-full px-3 py-0 wrap-anywhere",
				row: "h-auto min-h-11 rounded-md px-3 py-2",
				icon: "size-9 rounded-md",
				"icon-sm": "size-8 rounded-md",
				"icon-compact": "size-8 rounded-md",
				"icon-xs": "size-7 rounded-sm",
				"icon-lg": "size-11 rounded-lg",
				language: "h-12 w-13 rounded-md px-0 py-0 lg:h-11 lg:w-auto lg:px-3",
				"language-compact": "h-12 w-13 rounded-md p-0",
				toolbar: `${controlHeights.toolbar} rounded-md px-3 py-0 whitespace-nowrap`,
				"toolbar-icon": "size-11 rounded-md",
				header: "h-12 rounded-md px-3 py-0 whitespace-nowrap lg:h-11",
				"header-icon": "size-12 rounded-md lg:size-11",
			},
		},
		compoundVariants: [
			// Compact visuals keep the shared 44px pseudo hit area instead of inflating their rows on touch.
			{ size: ["chip", "icon-compact"], className: "pointer-coarse:min-h-0 pointer-coarse:min-w-0" },
			{ variant: "link", className: "min-h-0 py-0 pointer-coarse:min-h-0" },
			{ variant: "link", size: "link-touch", className: "min-h-12 pointer-coarse:min-h-12" },
			{ variant: "ghost", size: "default", className: "px-3" },
			// Press feedback; a text link doesn't press, and a loading button blocks activation.
			{ variant: ["primary", "secondary", "ghost", "danger"], className: "not-aria-busy:active:scale-[0.97]" },
		],
		defaultVariants: {
			variant: "primary",
			size: "default",
		},
	},
);

type ButtonProps = ButtonPrimitive.Props &
	VariantProps<typeof buttonVariants> & {
		/** Shows a spinner and blocks activation. Pair it with a present-participle label ("Preparing…"). */
		loading?: boolean;
	};

function Button({
	className,
	type = "button",
	variant = "primary",
	size = "default",
	disclosure,
	loading = false,
	onClick,
	children,
	...props
}: ButtonProps) {
	return (
		<ButtonPrimitive
			data-slot="button"
			data-size={size}
			type={type}
			aria-busy={loading || undefined}
			className={cn(buttonVariants({ variant, size, disclosure, className }))}
			onClick={loading ? (event) => event.preventDefault() : onClick}
			{...props}
		>
			{loading && <Spinner decorative />}
			{children}
		</ButtonPrimitive>
	);
}

export { Button, type ButtonProps, buttonVariants };
