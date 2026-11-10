import { Outlet, useMatchRoute } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { Icon } from "@reactive-resume/ui/components/icon";
import { useAuthCopy } from "./copy.generated";
import { LocaleSwitch } from "@/features/locale/switch";

export function AuthLayout() {
	const copy = useAuthCopy();
	const matchRoute = useMatchRoute();
	const verifying = Boolean(matchRoute({ to: "/auth/verify-email" }));
	return (
		<div className="grid min-h-svh bg-bg lg:grid-cols-2">
			<section className="hidden flex-col justify-center gap-7 bg-brand-panel p-16 text-on-brand lg:order-2 lg:flex">
				<h2 className="w-full max-w-xl type-display-s">
					{copy(verifying ? "auth.verifyEmail.introTitle" : "auth.promo.title")}
				</h2>
				<ul className="grid gap-4 type-lead">
					{(verifying
						? (["auth.verifyEmail.securityHint", "auth.verifyEmail.expiryHint"] as const)
						: (["auth.promo.confirmFacts", "auth.promo.compareWording", "auth.promo.originalPreserved"] as const)
					).map((key) => (
						<li key={key} className="flex items-center gap-3">
							<Icon name="check-circle" size={22} className="shrink-0" />
							{copy(key)}
						</li>
					))}
				</ul>
			</section>
			<div className="flex min-w-0 flex-col lg:order-1 lg:px-20 lg:py-10">
				<header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-(--space-18) lg:h-11 lg:border-0 lg:bg-transparent lg:px-0">
					<BrandIcon variant="logo" />
					<LocaleSwitch />
				</header>
				<main className="mx-auto flex w-full flex-1 flex-col gap-(--space-18) px-(--space-18) pt-7 pb-8 lg:max-w-md lg:justify-center lg:gap-5 lg:px-0 lg:py-0">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
