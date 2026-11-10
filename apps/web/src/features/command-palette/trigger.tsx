import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { Kbd } from "@reactive-resume/ui/components/kbd";
import { useCommandPaletteStore } from "./store";

/** One search entry in the shell header, including full-screen mobile workspaces. */
export function CommandPaletteTrigger({ compact = false }: { compact?: boolean }) {
	const openPalette = useCommandPaletteStore((state) => state.setOpen);
	const open = useCommandPaletteStore((state) => state.open);
	return (
		<Button
			data-slot="shell-search"
			size={compact ? "header-icon" : "header"}
			variant="secondary"
			aria-label={t({ message: "Search or jump to…", context: "shell.search.trigger" })}
			aria-keyshortcuts="Meta+K Control+K"
			aria-haspopup="dialog"
			aria-expanded={open}
			onClick={() => openPalette(true)}
			className={compact ? undefined : "w-full min-w-0 justify-between text-ink-2"}
		>
			<Icon name="magnifying-glass" />
			{!compact && (
				<>
					<span className="min-w-0 flex-1 truncate text-start">
						<Trans context="shell.search.trigger">Search or jump to…</Trans>
					</span>
					<Kbd keys="Mod+K" />
				</>
			)}
		</Button>
	);
}
