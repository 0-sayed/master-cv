import type { Theme } from "@/libs/theme";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { useQueryClient } from "@tanstack/react-query";
import { useRouteContext, useRouter } from "@tanstack/react-router";
import { useId, useState, useEffect } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { SegmentedControl, SegmentedControlItem } from "@reactive-resume/ui/components/segmented-control";
import { toast } from "@reactive-resume/ui/components/toast";
import { formatUiTimestamp } from "@reactive-resume/utils/ui-format";
import { SettingsSection, SettingsRow } from "./section";
import { Combobox } from "@/components/ui/combobox";
import { LocaleCombobox } from "@/features/locale/combobox";
import { useTheme } from "@/features/theme/provider";
import { authClient } from "@/libs/auth/client";
import { getReadableErrorMessage } from "@/libs/error-message";
import { sessionQueryKey } from "@/libs/root-context";
import { themeMap } from "@/libs/theme";

const THEMES: Theme[] = ["light", "dark", "system"];

export function PreferencesSettings() {
	const languageId = useId();
	const timezoneId = useId();

	return (
		<SettingsSection
			width="full"
			presentation="card"
			title={<Trans context="account.preferences.title">Preferences</Trans>}
		>
			<SettingsRow
				title={<Trans context="account.theme.label">Appearance</Trans>}
				description={<Trans>Resumes always render on white paper, whatever the theme.</Trans>}
			>
				<ThemeChoices />
			</SettingsRow>
			<SettingsRow
				title={
					<label htmlFor={languageId}>
						<Trans context="language.interface.label">Interface language</Trans>
					</label>
				}
				description={
					<Trans context="language.interface.independenceHint">
						Changing the interface language never translates or changes your CVs.
					</Trans>
				}
			>
				<LocaleCombobox id={languageId} />
			</SettingsRow>
			<TimezoneSetting id={timezoneId} />
		</SettingsSection>
	);
}

const timeZones = ["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => ({ value: zone, label: zone }));

/** The account's timezone, which interview times, reminders and schedules use. Saved as soon as it's chosen. */
function TimezoneSetting({ id }: { id: string }) {
	const router = useRouter();
	const { i18n } = useLingui();
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30000);
		return () => clearInterval(timer);
	}, []);
	const [saving, setSaving] = useState(false);
	const queryClient = useQueryClient();
	const { session } = useRouteContext({ strict: false });
	const saved = session?.user.timezone ?? "UTC";
	const [value, setValue] = useState(saved);
	const device = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const save = async (timezone: string) => {
		if (saving) return;
		setSaving(true);
		const previous = value;
		setValue(timezone);
		const { error } = await authClient.updateUser({ timezone });
		setSaving(false);
		if (error) {
			setValue(previous);
			toast.add({ type: "error", description: getReadableErrorMessage(error, t`Couldn't save the timezone.`) });
			return;
		}
		await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
		await router.invalidate();
		toast.add({ type: "success", description: t({ message: "Saved", context: "editor.save.status.saved" }) });
	};

	return (
		<>
			<SettingsRow
				title={
					<label htmlFor={id}>
						<Trans>Timezone</Trans>
					</label>
				}
				description={
					<>
						<Trans>Current local time</Trans>
						{": "}
						<time dateTime={now.toISOString()}>
							{formatUiTimestamp(now, i18n.locale === "en-US" ? "en-US" : "ar-SA", {
								timeZone: value,
								hour: "numeric",
								minute: "2-digit",
							})}
						</time>
						<br />
						<Trans>Interview times, reminders and schedules in Career use it.</Trans>
					</>
				}
			>
				<div className="grid min-w-0 gap-2">
					<Combobox
						id={id}
						disabled={saving}
						showClear={false}
						options={timeZones}
						value={value}
						placeholder={t`Search timezones`}
						emptyMessage={t`No timezone matches.`}
						onValueChange={(zone) => zone && zone !== value && void save(zone)}
					/>
				</div>
			</SettingsRow>
			<div className="flex min-w-0 justify-end">
				<Button
					variant="link"
					size="link-compact"
					disabled={saving || device === value}
					onClick={() => void save(device)}
				>
					<span>
						<Trans>Use this device's timezone ({device})</Trans>
					</span>
				</Button>
			</div>
		</>
	);
}

/** Compact shared theme choices apply at once. */
function ThemeChoices() {
	const { i18n } = useLingui();
	const { theme, setTheme } = useTheme();

	return (
		<SegmentedControl
			aria-label={t`Theme`}
			value={theme}
			onValueChange={(value) => {
				setTheme(value as Theme);
				toast.add({ type: "success", description: t({ message: "Saved", context: "editor.save.status.saved" }) });
			}}
		>
			{THEMES.map((option) => (
				<SegmentedControlItem key={option} value={option}>
					{option === "system" ? t`System` : i18n.t(themeMap[option])}
				</SegmentedControlItem>
			))}
		</SegmentedControl>
	);
}
