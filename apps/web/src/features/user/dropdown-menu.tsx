import type { AuthSession } from "@reactive-resume/auth/types";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
} from "@reactive-resume/ui/components/dropdown-menu";
import { Icon } from "@reactive-resume/ui/components/icon";
import { toast } from "@reactive-resume/ui/components/toast";
import { useSignOut } from "@/features/auth/use-sign-out";
import { useUiLocale } from "@/features/locale/provider";
import { ThemeChoices } from "@/features/theme/choices";
import { useCurrentSession } from "@/hooks/use-current-session";
import { getReadableErrorMessage } from "@/libs/error-message";

type Props = {
	children: ({ session }: { session: AuthSession }) => React.ComponentProps<typeof DropdownMenuTrigger>["render"];
};

export function UserDropdownMenu({ children }: Props) {
	const signOut = useSignOut();
	const session = useCurrentSession();
	const { locale, pending, changeLocale } = useUiLocale();
	const changeLanguage = (value: string) => {
		if (value !== "ar-SA" && value !== "en-US") return;
		void changeLocale(value).catch(() =>
			toast.add({ type: "error", description: t`Something went wrong. Please try again.` }),
		);
	};

	const handleLogout = async () => {
		const toastId = toast.add({ type: "loading", description: t`Signing out...` });

		try {
			await signOut();
			toast.close(toastId);
		} catch (error) {
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
		}
	};

	if (!session?.user) return null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={children({ session: session as AuthSession })} />

			<DropdownMenuContent align="start" side="top" className="w-80 max-w-(--available-width)">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="grid gap-0.5">
						<bdi className="truncate type-label">{session.user.name}</bdi>
						<bdi dir="ltr" className="truncate type-metadata font-normal text-ink-2">
							{session.user.email}
						</bdi>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem render={<Link to="/dashboard/settings" />}>
						<Icon name="gear-six" size={16} />
						<Trans context="account.navigation.settings">Settings</Trans>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuItem render={<Link to="/help" />}>
					<Icon name="question" />
					<Trans context="account.menu.help">Help</Trans>
				</DropdownMenuItem>
				<DropdownMenuItem render={<Link to="/dashboard/review-guide" search={{ locale }} />}>
					<Icon name="book-open" />
					<Trans context="atsGuide.title">Review guide</Trans>
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger disabled={pending}>
						<Icon name="globe" />
						<Trans context="account.menu.language">Language</Trans>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent>
						<DropdownMenuRadioGroup value={locale} onValueChange={changeLanguage}>
							<DropdownMenuRadioItem value="ar-SA" lang={locale}>
								<Trans>Arabic</Trans>
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="en-US" lang={locale}>
								<Trans>English</Trans>
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						<Trans context="account.menu.theme">Theme</Trans>
					</DropdownMenuLabel>
					<ThemeChoices />
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
