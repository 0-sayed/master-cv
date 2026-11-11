import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@reactive-resume/utils/style";

type Props = React.ComponentProps<"img"> & {
	variant?: "logo" | "icon";
	approveOnMount?: boolean;
	/** Repeat the approval motion with a quiet interval while a screen is loading. */
	loop?: boolean;
	/** Landing story surfaces can change without changing the global theme. */
	tone?: "light" | "dark" | undefined;
};

export function BrandIcon({
	variant = "logo",
	className,
	alt,
	approveOnMount = false,
	loop = false,
	tone,
	...props
}: Props) {
	const ref = useRef<HTMLSpanElement>(null);
	const locked = useRef(false);
	const [playing, setPlaying] = useState(false);
	const id = useId();
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const target = element.closest("a, button") ?? element;
		const media = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
		let repeat: ReturnType<typeof setTimeout> | undefined;
		const play = () => {
			if (locked.current || media?.matches) return;
			clearTimeout(repeat);
			locked.current = true;
			setPlaying(true);
		};
		const stop = () => {
			if (media?.matches) {
				clearTimeout(repeat);
				locked.current = false;
				setPlaying(false);
			} else if (loop) {
				play();
			}
		};
		const ended = (event: AnimationEvent) => {
			if (event.animationName !== "brand-approved") return;
			locked.current = false;
			setPlaying(false);
			if (loop && !media?.matches) {
				const token = getComputedStyle(element).getPropertyValue("--motion-brand-rest").trim();
				const rest = Number.parseFloat(token) * (token.endsWith("ms") ? 1 : 1000);
				repeat = setTimeout(play, rest);
			}
		};
		element.addEventListener("animationend", ended);
		media?.addEventListener?.("change", stop);
		target.addEventListener("pointerenter", play);
		target.addEventListener("focus", play);
		const frame = approveOnMount || loop ? requestAnimationFrame(play) : undefined;
		return () => {
			clearTimeout(repeat);
			if (frame !== undefined) cancelAnimationFrame(frame);
			element.removeEventListener("animationend", ended);
			target.removeEventListener("pointerenter", play);
			target.removeEventListener("focus", play);
			media?.removeEventListener?.("change", stop);
		};
	}, [approveOnMount, loop]);
	const mark = (
		<span ref={ref} dir="ltr" data-slot="brand-mark" data-playing={playing} data-tone={tone} className="brand-mark">
			<img
				src={"/master-cv/dark.svg"}
				alt={alt ?? (variant === "icon" ? "Master CV" : "")}
				className={cn("brand-dark size-8 max-w-none shrink-0 object-contain", className)}
				{...props}
			/>
			<img
				src={"/master-cv/light.svg"}
				alt={alt ?? (variant === "icon" ? "Master CV" : "")}
				className={cn("brand-light size-8 max-w-none shrink-0 object-contain", className)}
				{...props}
			/>
			<svg aria-hidden="true" className="brand-approval" viewBox="0 0 32 32" fill="none">
				<defs>
					<mask id={`${id}-c`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
						<path
							className="brand-c-reveal"
							d="M20 7 A10 10 0 1 0 20 25"
							pathLength="1"
							stroke="var(--paper)"
							strokeWidth="7"
							strokeLinecap="round"
						/>
					</mask>
					<mask id={`${id}-tick`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
						<path
							className="brand-tick-reveal"
							d="M14.5 16 L18.7 20.2 L28 6.5"
							pathLength="1"
							stroke="var(--paper)"
							strokeWidth="7"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</mask>
				</defs>
				<g mask={`url(#${id}-c)`}>
					<path d={BRAND_C} className="brand-curve" />
					<path d={BRAND_C} className="brand-tint" />
				</g>
				<path d={BRAND_TICK} className="brand-tick" mask={`url(#${id}-tick)`} />
			</svg>
		</span>
	);
	if (variant === "icon") return mark;
	return (
		<span dir="ltr" className="inline-flex shrink-0 items-center gap-2 py-1.5">
			{mark}
			<span lang="en" className="type-section whitespace-nowrap" style={{ fontFamily: '"Noto Sans", sans-serif' }}>
				Master CV
			</span>
		</span>
	);
}

// Exact approved asset geometry, guarded against the shipped SVG files.
const BRAND_C =
	"M3.6411 16C3.6411 13.9673 4.15737 11.9679 5.14159 10.1895C6.12581 8.41099 7.54576 6.91154 9.26805 5.83203C10.9903 4.75255 12.9587 4.12816 14.9883 4.01758C17.0179 3.907 19.0422 4.31421 20.8716 5.20019C21.8657 5.68165 22.2812 6.87748 21.7998 7.87158C21.3183 8.86567 20.1225 9.28122 19.1284 8.7998C17.9089 8.20915 16.5591 7.93803 15.206 8.01172C13.853 8.08544 12.5408 8.50201 11.3926 9.22168C10.2444 9.94136 9.29774 10.9408 8.64159 12.1265C7.98545 13.3121 7.6411 14.6449 7.6411 16C7.6411 17.3551 7.98545 18.6879 8.64159 19.8735C9.29774 21.0592 10.2444 22.0586 11.3926 22.7783C12.5408 23.498 13.853 23.9146 15.206 23.9883C16.5591 24.062 17.9089 23.7908 19.1284 23.2002C20.1225 22.7188 21.3183 23.1343 21.7998 24.1284C22.2812 25.1225 21.8657 26.3183 20.8716 26.7998C19.0422 27.6858 17.0179 28.093 14.9883 27.9824C12.9587 27.8718 10.9903 27.2475 9.26805 26.168C7.54576 25.0885 6.12581 23.589 5.14159 21.8105C4.15737 20.0321 3.6411 18.0327 3.6411 16Z";

// Exact approved asset geometry, guarded against the shipped SVG files.
const BRAND_TICK =
	"M26.3403 5.38379C26.9568 4.46737 28.1997 4.22396 29.1162 4.84033C30.0326 5.45683 30.276 6.69974 29.6597 7.61621L20.4097 21.3662C20.076 21.8622 19.5378 22.1831 18.9429 22.2407C18.348 22.2984 17.7586 22.0867 17.3359 21.6641L13.0859 17.4141C12.3049 16.633 12.3049 15.367 13.0859 14.5859C13.867 13.8049 15.133 13.8049 15.9141 14.5859L18.4463 17.1182L26.3403 5.38379Z";
