import type { IconName } from "@reactive-resume/ui/components/icon";
import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Link, useRouteContext } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@reactive-resume/ui/components/avatar";
import { Icon } from "@reactive-resume/ui/components/icon";
import { getInitials } from "@reactive-resume/utils/string";
import { SignOutButton } from "./account/page";
import { useTheme } from "@/features/theme/provider";
import { themeMap } from "@/libs/theme";

type RowProps = { icon: IconName; label: ReactNode; value?: ReactNode };

function Row({ icon, label, value }: RowProps) {
	return (
		<>
			<Icon name={icon} size={22} className="text-ink-2" />
			<span className="flex-1">{label}</span>
			{value && <span className="truncate type-body text-ink-3">{value}</span>}
			<Icon name="caret-right" size={22} className="text-ink-3" />
		</>
	);
}

const rowClass =
	"flex h-14 items-center gap-3 px-3.5 type-label transition-colors duration-quick ease-enter active:bg-press";

/** Phones: the Settings tab opens the available account and preference pages. */
export function SettingsRoot() {
	const { i18n } = useLingui();
	const { session } = useRouteContext({ from: "/dashboard" });
	const { theme } = useTheme();

	return (
		<div className="grid gap-4">
			<div className="flex items-center gap-3">
				<Avatar size="profile">
					<AvatarImage src={session.user.image ?? undefined} alt="" />
					<AvatarFallback className="bg-accent-soft font-semibold text-accent-text">
						{getInitials(session.user.name)}
					</AvatarFallback>
				</Avatar>
				<span className="grid min-w-0">
					<b className="truncate type-section">{session.user.name}</b>
					<bdi dir="ltr" className="truncate type-body text-ink-3">
						{session.user.email}
					</bdi>
				</span>
			</div>

			<nav
				aria-label={t({ message: "Settings", context: "account.navigation.settings" })}
				className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface"
			>
				<Link to="/dashboard/settings/account" className={rowClass}>
					<Row icon="user-circle" label={<Trans context="account.settings.accountTab">Account</Trans>} />
				</Link>
				<Link to="/dashboard/settings/preferences" className={rowClass}>
					<Row
						icon="sliders-horizontal"
						label={<Trans context="account.preferences.title">Preferences</Trans>}
						value={i18n.t(themeMap[theme])}
					/>
				</Link>
			</nav>

			<SignOutButton />
		</div>
	);
}
