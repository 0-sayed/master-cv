import { Outlet } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { LocaleSwitch } from "@/features/locale/switch";

export function AuthLayout() {
	return (
		<div className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center gap-y-6 px-[18px] py-8">
			<div className="self-end">
				<LocaleSwitch />
			</div>
			<BrandIcon className="mb-4 size-20 self-center [view-transition-name:auth-brand]" />

			<Outlet />
		</div>
	);
}
