import type { DocumentSummary } from "./filter";
import type { ComponentProps, CSSProperties } from "react";
import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Checkbox } from "@reactive-resume/ui/components/checkbox";
import { ContextMenu, ContextMenuTrigger } from "@reactive-resume/ui/components/context-menu";
import { documentCardLayout } from "@reactive-resume/ui/components/document-card-layout";
import { DropdownMenu, DropdownMenuTrigger } from "@reactive-resume/ui/components/dropdown-menu";
import { Icon } from "@reactive-resume/ui/components/icon";
import { IconButton } from "@reactive-resume/ui/components/icon-button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@reactive-resume/ui/components/tooltip";
import { parseColorString, rgbaStringToHex } from "@reactive-resume/utils/color";
import { cn } from "@reactive-resume/utils/style";
import { DocumentMenuContent, useDocumentActions } from "./document-actions";
import { DocumentType } from "./document-type";
import { daysLeftInTrash } from "./filter";
import { DocumentApplication, DocumentMetadata, LetterCardDetails } from "./letter-card-content";
import { useNewDocumentsStore } from "./new-documents";
import { TrashDocumentRow } from "./trash-row";
import { isImeComposing } from "@/libs/keyboard";
import { formatRelativeTime } from "@/libs/locale";
import { ENTER_CLASS, stagger } from "@/libs/motion";

export type DocumentItemProps = {
	library?: boolean;
	showType?: boolean;
	document: DocumentSummary;
	onTags: (document: DocumentSummary) => void;
	onLink: (document: DocumentSummary) => void;
	/** Position in the library's first appearance, which staggers in; undefined afterwards and in Trash. */
	introIndex?: number | undefined;
	/** Whether the document is in the current selection. */
	selected?: boolean | undefined;
	onSelectedChange?: ((selected: boolean) => void) | undefined;
	/** Something is selected, so clicking a card toggles it instead of opening it. */
	selecting?: boolean | undefined;
	/** Temporarily blocks item actions while a collection operation is running. */
	disabled?: boolean | undefined;
};

/** "Resume · Edited 2h ago", or the days left for a document in Trash. */
function useDocumentMeta(document: DocumentSummary) {
	const { i18n } = useLingui();
	const type = document.type === "resume" ? t`Resume` : t`Letter`;
	if (document.trashedAt) return t`${type} · ${daysLeftInTrash(document.trashedAt)} days left`;
	const relativeTime = formatRelativeTime(document.updatedAt, i18n.locale);
	return t`Edited ${relativeTime}`;
}

/** Opens the document in its editor: resumes and letters share the editor shell. */
function OpenLink({
	document,
	className,
	children,
	label,
	onSelect,
	target,
	...anchorProps
}: Pick<DocumentItemProps, "document"> & {
	className?: string;
	children?: React.ReactNode;
	label?: string;
	/** While selecting, a click toggles the document instead of opening it. */
	onSelect?: (() => void) | undefined;
} & Omit<ComponentProps<"a">, "children" | "href">) {
	const markOpened = useNewDocumentsStore((state) => state.markOpened);
	if (document.trashedAt) return <span className={className}>{children}</span>;
	const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
		anchorProps.onClick?.(event);
		if (event.defaultPrevented) return;
		if (!onSelect) return markOpened(document.id);
		event.preventDefault();
		onSelect();
	};
	const common = {
		...anchorProps,
		...(target !== undefined ? { target } : {}),
		"aria-label": label,
		className,
		onClick,
	};

	return document.type === "resume" ? (
		<Link to="/builder/$resumeId" params={{ resumeId: document.id }} preload={false} {...common}>
			{children}
		</Link>
	) : (
		<Link to="/builder/letter/$coverLetterId" params={{ coverLetterId: document.id }} preload={false} {...common}>
			{children}
		</Link>
	);
}

/** Enter commits, Esc cancels, and leaving the field commits. */
function RenameInput({ document, onDone }: { document: DocumentSummary; onDone: () => void }) {
	const actions = useDocumentActions();
	const [value, setValue] = useState(document.name);
	const commit = () => {
		actions.rename(document, value);
		onDone();
	};

	return (
		<input
			// oxlint-disable-next-line jsx-a11y/no-autofocus -- renaming starts from the menu, so focus goes straight to the field.
			autoFocus
			value={value}
			dir="auto"
			maxLength={100}
			aria-label={t`Name`}
			onChange={(event) => setValue(event.target.value)}
			onFocus={(event) => event.target.select()}
			onBlur={commit}
			onKeyDown={(event) => {
				if (isImeComposing(event)) return;
				if (event.key === "Enter") commit();
				if (event.key === "Escape") {
					event.stopPropagation();
					onDone();
				}
			}}
			className="h-7 w-full min-w-0 rounded-md border border-accent bg-raised px-1.5 type-body font-semibold ring-3 ring-accent-soft outline-none"
		/>
	);
}

/** Compact saved identity with a real editor link and independent sibling controls. */
export function DocumentCard({
	library = false,
	document,
	onTags,
	onLink,
	introIndex,
	selected = false,
	onSelectedChange,
	selecting = false,
	disabled = false,
}: DocumentItemProps) {
	const { i18n } = useLingui();
	const openDocument = useOpenDocument();
	const [renaming, setRenaming] = useState(false);
	const isNew = useNewDocumentsStore((state) => state.ids.includes(document.id)) && !document.trashedAt;
	const meta = useDocumentMeta(document);
	const exactTime = new Intl.DateTimeFormat(i18n.locale, { dateStyle: "full", timeStyle: "short" }).format(
		document.updatedAt,
	);
	const accent = document.metadata?.accent;
	const tint = accent && parseColorString(accent) ? rgbaStringToHex(accent) : undefined;
	const menuProps = {
		document,
		onOpen: () => openDocument(document),
		onRename: () => setRenaming(true),
		onTags: () => onTags(document),
		onLink: () => onLink(document),
		onSelect: onSelectedChange && !selected ? () => onSelectedChange(true) : undefined,
	};
	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<article
						style={introIndex === undefined ? undefined : stagger(introIndex)}
						data-slot="document-card"
						aria-label={document.name}
						className={cn(
							documentCardLayout.surface({ library }),
							introIndex !== undefined && ENTER_CLASS,
							isNew && "animate-arrive",
							selected && "border-accent bg-accent-soft",
							document.trashedAt && "opacity-70",
						)}
					/>
				}
			>
				<div className={documentCardLayout.cue}>
					<span
						aria-hidden="true"
						className={documentCardLayout.iconTile}
						style={tint ? ({ "--document-accent": tint } as CSSProperties) : undefined}
					>
						<Icon name={document.type === "resume" ? "file-text" : "envelope-simple"} />
					</span>
				</div>
				<h2 className={documentCardLayout.title}>
					{renaming ? (
						<RenameInput document={document} onDone={() => setRenaming(false)} />
					) : (
						<Tooltip>
							<TooltipTrigger
								render={
									<OpenLink
										document={document}
										dir="auto"
										className={documentCardLayout.titleLink}
										onSelect={selecting && onSelectedChange ? () => onSelectedChange(!selected) : undefined}
									/>
								}
							>
								{document.name}
							</TooltipTrigger>
							<TooltipContent dir="auto">{document.name}</TooltipContent>
						</Tooltip>
					)}
				</h2>
				<div className={documentCardLayout.controls}>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<IconButton
									icon="dots-three"
									size="icon-lg"
									label={t`Options for ${document.name}`}
									disabled={disabled}
								/>
							}
						/>
						<DocumentMenuContent {...menuProps} />
					</DropdownMenu>
				</div>
				{document.type === "letter" ? (
					<LetterCardDetails document={document} />
				) : (
					<>
						<DocumentMetadata document={document} />
						<DocumentApplication document={document} />
					</>
				)}
				{(isNew || document.isLocked || (isFeatureAvailable("publicSharing") && document.isPublic)) && (
					<div className={documentCardLayout.indicators}>
						{isNew && (
							<Badge variant="neutral">
								<Trans>New</Trans>
							</Badge>
						)}
						{document.isLocked && (
							<Badge variant="neutral">
								<Icon name="lock" size={12} />
								<Trans>Locked</Trans>
							</Badge>
						)}
						{isFeatureAvailable("publicSharing") && document.isPublic && (
							<Badge variant="neutral">
								<Icon name="globe" size={12} />
								<Trans>Public</Trans>
							</Badge>
						)}
					</div>
				)}
				<Tooltip>
					<TooltipTrigger
						render={
							<time
								dateTime={document.updatedAt.toISOString()}
								data-slot="document-meta"
								className={documentCardLayout.date}
								aria-label={exactTime}
							/>
						}
					>
						{meta}
					</TooltipTrigger>
					<TooltipContent>{exactTime}</TooltipContent>
				</Tooltip>
				{onSelectedChange && (
					<Checkbox
						checked={selected}
						onCheckedChange={onSelectedChange}
						disabled={disabled}
						aria-label={t`Select ${document.name}`}
						className={documentCardLayout.selection}
					/>
				)}
			</ContextMenuTrigger>
			<DocumentMenuContent {...menuProps} variant="context" />
		</ContextMenu>
	);
}

/** The list view's row: Name, Type, Application, Edited, ⋯. */
export function DocumentRow(props: DocumentItemProps) {
	return props.document.trashedAt ? <TrashDocumentRow {...props} /> : <ActiveDocumentRow {...props} />;
}

function ActiveDocumentRow({
	document,
	onTags,
	onLink,
	introIndex,
	selected = false,
	onSelectedChange,
	showType = true,
	selecting = false,
	disabled = false,
}: DocumentItemProps) {
	const { i18n } = useLingui();
	const openDocument = useOpenDocument();
	const [renaming, setRenaming] = useState(false);
	const isNew = useNewDocumentsStore((state) => state.ids.includes(document.id)) && !document.trashedAt;
	const menuProps = {
		document,
		onOpen: () => openDocument(document),
		onRename: () => setRenaming(true),
		onTags: () => onTags(document),
		onLink: () => onLink(document),
		onSelect: onSelectedChange && !selected ? () => onSelectedChange(true) : undefined,
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger
				render={
					<tr
						style={introIndex === undefined ? undefined : stagger(introIndex)}
						className={cn(
							documentCardLayout.row,
							"transition-colors duration-quick hover:bg-hover",
							selected && "bg-accent-soft hover:bg-accent-soft",
							introIndex !== undefined && ENTER_CLASS,
							document.trashedAt && "opacity-70",
						)}
					/>
				}
			>
				{onSelectedChange && (
					<td className="w-10 ps-3">
						<Checkbox
							checked={selected}
							onCheckedChange={onSelectedChange}
							disabled={disabled}
							aria-label={t`Select ${document.name}`}
						/>
					</td>
				)}
				<td className={documentCardLayout.cell}>
					<span className={documentCardLayout.identity}>
						<Icon name={document.type === "resume" ? "file-text" : "envelope-simple"} className="shrink-0 text-ink-2" />
						{renaming ? (
							<RenameInput document={document} onDone={() => setRenaming(false)} />
						) : (
							<OpenLink
								document={document}
								dir="auto"
								onSelect={selecting && onSelectedChange ? () => onSelectedChange(!selected) : undefined}
								className={documentCardLayout.rowTitle}
							>
								{document.name}
							</OpenLink>
						)}
						{isNew && (
							<span className="rounded bg-accent px-1.5 type-metadata font-semibold text-on-accent">
								<Trans>New</Trans>
							</span>
						)}
						{isFeatureAvailable("publicSharing") && document.isPublic && (
							<span title={t`Public`} className="shrink-0 text-ink-3">
								<Icon name="globe" size={16} />
								<span className="sr-only">
									<Trans>Public</Trans>
								</span>
							</span>
						)}
						{document.isLocked && <Icon name="lock" size={16} className="shrink-0 text-ink-3" />}
					</span>
					<div className={documentCardLayout.rowMetadata}>
						<DocumentMetadata document={document} />
						<div className={documentCardLayout.mobileDetails}>
							<DocumentApplication document={document} />
							<time dateTime={document.updatedAt.toISOString()}>
								{formatRelativeTime(document.updatedAt, i18n.locale)}
							</time>
						</div>
					</div>
				</td>
				{showType && (
					<td className={documentCardLayout.typeColumn}>
						<DocumentType type={document.type} />
					</td>
				)}
				<td className={documentCardLayout.applicationCell}>
					<DocumentApplication document={document} />
				</td>
				<td className={documentCardLayout.editedCell}>{formatRelativeTime(document.updatedAt, i18n.locale)}</td>

				<td className="w-10 pe-2 text-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<IconButton
									icon="dots-three"
									size="icon-lg"
									label={t`Options for ${document.name}`}
									disabled={disabled}
								/>
							}
						/>
						<DocumentMenuContent {...menuProps} />
					</DropdownMenu>
				</td>
			</ContextMenuTrigger>
			<DocumentMenuContent {...menuProps} variant="context" />
		</ContextMenu>
	);
}

/** Open from a menu: resumes in the editor, letters in the letter editor. */
function useOpenDocument() {
	const navigate = useNavigate();
	return (document: DocumentSummary) => {
		useNewDocumentsStore.getState().markOpened(document.id);
		if (document.type === "letter") {
			void navigate({ to: "/builder/letter/$coverLetterId", params: { coverLetterId: document.id } });
			return;
		}
		void navigate({ to: "/builder/$resumeId", params: { resumeId: document.id } });
	};
}
