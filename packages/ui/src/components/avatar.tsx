import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { useState } from "react";
import { cn } from "@reactive-resume/utils/style";

function Avatar({
	className,
	size = "default",
	shape = "circle",
	...props
}: AvatarPrimitive.Root.Props & {
	size?: "default" | "sm" | "lg" | "sidebar" | "profile" | "preview";
	shape?: "circle" | "square";
}) {
	return (
		<AvatarPrimitive.Root
			data-slot="avatar"
			data-size={size}
			data-shape={shape}
			className={cn(
				"group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-line after:mix-blend-darken data-[shape=square]:rounded-md data-[shape=square]:after:rounded-md data-[size=lg]:size-10 data-[size=preview]:size-18 data-[size=profile]:size-12 data-[size=sidebar]:size-9 data-[size=sm]:size-7 dark:after:mix-blend-lighten",
				className,
			)}
			{...props}
		/>
	);
}

function hasVisiblePixels(image: HTMLImageElement) {
	if (!image.naturalWidth || !image.naturalHeight) return false;
	const canvas = document.createElement("canvas");
	canvas.width = Math.min(image.naturalWidth, 64);
	canvas.height = Math.min(image.naturalHeight, 64);
	try {
		const context = canvas.getContext("2d");
		if (!context) return true;
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		for (let alpha = 3; alpha < pixels.length; alpha += 4) {
			if ((pixels[alpha] ?? 0) > 0) return true;
		}
		return false;
	} catch {
		// Cross-origin portraits can load without granting canvas pixel access.
		return true;
	}
}

function AvatarImage({
	className,
	style,
	src,
	alt = "",
	onLoad,
	onError,
	keepMounted = true,
	...props
}: AvatarPrimitive.Image.Props) {
	const [rejectedSource, setRejectedSource] = useState<string>();
	if (!src?.trim() || rejectedSource === src) return null;
	return (
		<AvatarPrimitive.Image
			data-slot="avatar-image"
			src={src}
			alt={alt}
			keepMounted={keepMounted}
			className={cn(
				"absolute inset-0 aspect-square size-full rounded-full object-cover transition-opacity duration-quick ease-enter group-data-[shape=square]/avatar:rounded-md data-error:invisible data-loading:invisible starting:opacity-0",
				className,
			)}
			{...props}
			// Loading/error attributes exclude the initial idle (including server HTML) state.
			// Keep the native image hidden until Base UI confirms it loaded successfully.
			style={(state) => ({
				...(typeof style === "function" ? style(state) : style),
				...(state.imageLoadingStatus !== "loaded" ? { visibility: "hidden" } : {}),
			})}
			onLoad={(event) => {
				setRejectedSource(hasVisiblePixels(event.currentTarget) ? undefined : src);
				onLoad?.(event);
			}}
			onError={(event) => {
				setRejectedSource(src);
				onError?.(event);
			}}
		/>
	);
}

function AvatarFallback({ className, ...props }: AvatarPrimitive.Fallback.Props) {
	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn(
				"flex size-full items-center justify-center rounded-full bg-sunken type-metadata font-semibold whitespace-nowrap text-ink-2 group-data-[shape=square]/avatar:rounded-md group-data-[size=sidebar]/avatar:p-1",
				className,
			)}
			{...props}
		/>
	);
}

export { Avatar, AvatarFallback, AvatarImage };
