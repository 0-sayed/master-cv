import type { AuthSession } from "@reactive-resume/auth/types";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@reactive-resume/ui/components/dropdown-menu";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { isUiLocale, productUiLocales } from "@reactive-resume/utils/locale";
import { useUiLocale } from "@/features/locale/provider";
import { useTheme } from "@/features/theme/provider";
import { authClient } from "@/libs/auth/client";
import { getReadableErrorMessage } from "@/libs/error-message";
import { localeMap } from "@/libs/locale";
import { isTheme } from "@/libs/theme";

type Props = {
	children: ({ session }: { session: AuthSession }) => React.ComponentProps<typeof DropdownMenuTrigger>["render"];
};

export function UserDropdownMenu({ children }: Props) {
	const router = useRouter();
	const queryClient = useQueryClient();
	const { i18n } = useLingui();
	const { theme, setTheme } = useTheme();
	const { locale, pending, changeLocale } = useUiLocale();
	const { data: session } = authClient.useSession();

	const handleThemeChange = (value: string) => {
		if (!isTheme(value)) return;
		setTheme(value);
	};

	const handleLogout = async () => {
		const toastId = toast.add({ type: "loading", description: t`Signing out...` });

		await authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					toast.close(toastId);
					queryClient.clear();
					void router.invalidate();
				},
				onError: ({ error }) => {
					toast.add({
						type: "error",
						description: getReadableErrorMessage(
							error,
							t({
								comment: "Fallback toast when signing out fails",
								message: "Failed to sign out. Please try again.",
							}),
						),
						id: toastId,
					});
				},
			},
		});
	};

	if (!session?.user) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={children({ session: session as AuthSession })} />

			<DropdownMenuContent align="start" side="top">
				<DropdownMenuItem onClick={() => void router.navigate({ to: "/dashboard/settings" })}>
					<Icon name="gear-six" />
					<Trans context="account.navigation.settings">Settings</Trans>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Icon name="translate" size={16} />
							<Trans comment="Menu item that opens language selection submenu">Language</Trans>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="max-h-[400px] overflow-y-auto">
							<DropdownMenuRadioGroup
								value={locale}
								onValueChange={(value) => {
									if (isUiLocale(value))
										void changeLocale(value).catch(() =>
											toast.add({ type: "error", description: t`Something went wrong. Please try again.` }),
										);
								}}
							>
								{productUiLocales.map((value) => (
									<DropdownMenuRadioItem key={value} value={value} disabled={pending}>
										{i18n.t(localeMap[value])}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuRadioGroup>
						</DropdownMenuSubContent>
					</DropdownMenuSub>

					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Icon name="palette" size={16} />
							<Trans comment="Menu item that opens appearance theme selection submenu">Theme</Trans>
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							<DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
								<DropdownMenuRadioItem value="light">
									<Trans context="account.theme.light">Light</Trans>
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="dark">
									<Trans context="account.theme.dark">Dark</Trans>
								</DropdownMenuRadioItem>
								<DropdownMenuRadioItem value="system">
									<Trans context="account.theme.system">Match my device</Trans>
								</DropdownMenuRadioItem>
							</DropdownMenuRadioGroup>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				<DropdownMenuItem onClick={handleLogout}>
					<Icon name="sign-out" size={16} />
					<Trans context="account.session.signOut" comment="User menu action to sign out of current account">
						Sign out
					</Trans>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
