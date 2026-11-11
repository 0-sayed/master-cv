import { useRouter } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { cn } from "@reactive-resume/utils/style";

export function LoadingScreen() {
	// Fades in on in-app navigations. On first load it takes over from the HTML loader in index.html, which
	// hides the moment React renders, so there it appears at full opacity instead of blinking the logo.
	const router = useRouter({ warn: false });
	const hasNavigated = router?.state.resolvedLocation !== undefined;

	return (
		<div
			data-slot="loading-screen"
			role="status"
			aria-label="Loading"
			className={cn(
				"fixed inset-0 z-50 flex h-svh w-svw flex-col items-center justify-center gap-y-6 bg-bg",
				hasNavigated && "transition-opacity duration-standard ease-enter starting:opacity-0",
			)}
		>
			<BrandIcon variant="icon" className="size-12" loop />
			<span aria-hidden="true" className="size-6" />
		</div>
	);
}
