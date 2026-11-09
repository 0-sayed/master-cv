import type { ReactNode } from "react";

type PageHeaderProps = {
	title: ReactNode;
	/** One line under the title. */
	description?: ReactNode;
	/** A small back link above the title. */
	back?: ReactNode;
	/** Buttons on the right of the title row. */
	actions?: ReactNode;
	/** The mobile shell already displays this page's title. */
	mobileTitleInShell?: boolean;
	/** The toolbar row under the title: navigation or view tabs first, then search, filters and sort. */
	children?: ReactNode;
};

/** The one header every dashboard page uses. Renders as siblings, so the page's own gap spaces the rows. */
export function PageHeader({ title, description, back, actions, children, mobileTitleInShell }: PageHeaderProps) {
	return (
		<>
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div className={mobileTitleInShell ? "grid min-w-0 gap-1 max-sm:sr-only" : "grid min-w-0 gap-1"}>
					{back && <div className="mb-2">{back}</div>}
					<h1 className="type-title wrap-anywhere">{title}</h1>
					{description && <p className="text-sm text-ink-2">{description}</p>}
				</div>
				{actions && (
					<div className={mobileTitleInShell ? "flex items-center gap-2 max-sm:w-full" : "flex items-center gap-2"}>
						{actions}
					</div>
				)}
			</header>
			{children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
		</>
	);
}
