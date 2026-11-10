import type { DialogContentProps } from "@reactive-resume/ui/components/dialog";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useHotkeys } from "@tanstack/react-hotkeys";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Command, CommandEmpty, CommandInput, CommandList } from "@reactive-resume/ui/components/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@reactive-resume/ui/components/dialog";
import { AskCommandGroup } from "./pages/ask";
import { NavigationCommandGroup } from "./pages/navigation";
import { PreferencesCommandGroup } from "./pages/preferences";
import { ResumesCommandGroup } from "./pages/resumes";
import { useCommandPaletteStore } from "./store";

export function CommandPalette() {
	const inputRef = useRef<HTMLInputElement>(null);
	const commandRef = useRef<HTMLDivElement>(null);
	const [selectedValue, setSelectedValue] = useState("");
	const { open, search, pages, setOpen, setSearch, goBack } = useCommandPaletteStore();
	const [anchor, setAnchor] = useState<NonNullable<DialogContentProps["anchor"]> | null>(null);

	useLayoutEffect(() => {
		if (!open) return;
		const trigger = document.querySelector<HTMLElement>('[data-slot="shell-search"]');
		// Synchronize the popup with observed trigger geometry, including responsive changes.
		const update = () => {
			// Mobile and editor palettes retain the shared centred dialog treatment.
			if (!trigger?.querySelector("kbd")) {
				setAnchor(null);
				return;
			}
			const { x, bottom, width } = trigger.getBoundingClientRect();
			setAnchor({ x, bottom, width });
		};
		update();
		if (!trigger) return;
		const observer = new ResizeObserver(update);
		observer.observe(trigger);
		const header = trigger.closest("header");
		if (header) observer.observe(header);
		return () => observer.disconnect();
	}, [open]);

	const isFirstPage = pages.length === 0;
	const currentPage = pages[pages.length - 1];
	const commandListPage = currentPage ?? "root";
	const embeddedQueryPage = currentPage === "resumes" || currentPage === "applications" || currentPage === "threads";

	// Toggle command palette with Cmd+K / Ctrl+K
	useHotkeys([
		{
			hotkey: "Mod+K",
			callback: () => {
				setOpen(!open);
			},
		},
		{
			hotkey: "Escape",
			// The editor also binds Escape. `allow` keeps both; `enabled` so a closed palette does not
			// preventDefault every Escape on the page.
			options: { enabled: open, conflictBehavior: "allow" },
			callback: () => {
				setOpen(false);
			},
		},
		{
			hotkey: "Backspace",
			options: { ignoreInputs: false, preventDefault: false, stopPropagation: false },
			callback: (event) => {
				// Only handle if the command palette is open
				if (!open) return;

				const input = inputRef.current;
				if (!input) return;

				// Only handle if input is focused
				if (document.activeElement !== input) return;

				// If input has text, let the default behavior handle it (delete character)
				if (search.length > 0) return;

				// If input is empty, prevent default and go back
				event.preventDefault();
				goBack();
			},
		},
	]);

	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
	};

	const handleSearchChange = (value: string) => {
		setSearch(value);
	};

	useEffect(() => {
		if (!open) return;

		const firstItem = commandRef.current?.querySelector<HTMLElement>(
			`[data-command-page="${commandListPage}"] [cmdk-item]:not([aria-disabled="true"])`,
		);
		const value = firstItem?.getAttribute("data-value");

		if (value) setSelectedValue(value);
		inputRef.current?.focus();
	}, [open, commandListPage]);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogHeader className="sr-only print:hidden">
				<DialogTitle>
					<Trans comment="Screen-reader dialog title for the command palette in the resume builder">
						Builder Command Palette
					</Trans>
				</DialogTitle>
				<DialogDescription>
					<Trans comment="Screen-reader dialog description instructing users how to use the command palette">
						Type a command or search…
					</Trans>
				</DialogDescription>
			</DialogHeader>

			<DialogContent
				instant
				anchor={anchor}
				finalFocus={() => document.querySelector<HTMLElement>('[data-slot="shell-search"]') ?? true}
				className="overflow-hidden p-0"
				aria-label={
					isFirstPage
						? t({
								comment: "Accessible label for the command palette dialog",
								message: "Command Palette",
							})
						: t({
								comment: "Accessible label for command palette dialog when browsing a nested command page",
								message: `Command Palette - ${currentPage}`,
							})
				}
			>
				<Command
					ref={commandRef}
					loop
					value={selectedValue}
					onValueChange={setSelectedValue}
					aria-label={t({
						comment: "Accessible label for command list region inside command palette",
						message: "Command Palette",
					})}
				>
					<CommandInput
						ref={inputRef}
						value={search}
						onValueChange={handleSearchChange}
						placeholder={
							isFirstPage
								? t({
										comment: "Placeholder in command palette input on root page",
										message: "Type a command or search…",
									})
								: t({
										comment: "Placeholder in command palette input on nested pages",
										message: "Search…",
									})
						}
						aria-label={t({
							comment: "Accessible label for command palette search input",
							message: "Search commands",
						})}
					/>

					<CommandList key={commandListPage} data-command-page={commandListPage}>
						{!embeddedQueryPage && (
							<CommandEmpty>
								<Trans comment="Empty-state message when no command palette results match the search query">
									No commands match that search.
								</Trans>
							</CommandEmpty>
						)}

						<ResumesCommandGroup />
						<PreferencesCommandGroup />
						<NavigationCommandGroup />
						<AskCommandGroup />
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
