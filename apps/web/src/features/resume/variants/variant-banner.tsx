import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@reactive-resume/ui/components/badge";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { browserStorage, storageKey } from "@/libs/browser-storage";
import { orpc } from "@/libs/orpc/client";
/** A copy's stored identity is independent from the interface language and review status. */
export function VariantBanner({ resumeId }: { resumeId: string }) {
	const family = useQuery(orpc.resume.variants.list.queryOptions({ input: { resumeId } }));
	const { data: documents } = useQuery(orpc.documents.list.queryOptions({ input: { trashed: false } }));
	const key = storageKey("variantContext", resumeId);
	const [collapsed, setCollapsed] = useState(() => {
		try {
			return browserStorage.session.getItem(key) === "collapsed";
		} catch {
			return false;
		}
	});
	const toggle = () =>
		setCollapsed((previous) => {
			try {
				browserStorage.session.setItem(key, previous ? "open" : "collapsed");
			} catch {
				/* Keep the session's in-memory choice. */
			}
			return !previous;
		});
	const current = family.data?.find((document) => document.resumeId === resumeId);
	if (!current || current.variantKind === "base") return null;
	const job = documents?.find((document) => document.id === resumeId)?.application;
	return (
		<section aria-label={t`Copy context`} className="grid gap-2 rounded-lg border border-line p-3">
			<div className="flex min-w-0 items-center gap-2">
				<Badge>{current.variantKind === "language" ? <Trans>Language copy</Trans> : <Trans>Job copy</Trans>}</Badge>
				<span className="type-metadata text-ink-2">
					{current.documentLocale.startsWith("ar") ? <Trans>Arabic</Trans> : <Trans>English</Trans>}
				</span>
				<Button
					className="ms-auto"
					size="icon-sm"
					variant="ghost"
					aria-label={collapsed ? t`Expand copy context` : t`Collapse copy context`}
					aria-expanded={!collapsed}
					onClick={toggle}
				>
					<Icon name="caret-down" className={collapsed ? undefined : "rotate-180"} />
				</Button>
			</div>
			{!collapsed && (
				<>
					<p dir="auto" className="type-body wrap-anywhere">
						{job ? `${job.role} · ${job.company}` : current.name}
					</p>
					<div className="flex flex-wrap items-center gap-3 type-metadata text-accent-text *:hover:underline">
						{current.sourceResumeId && (
							<Link to="/builder/$resumeId" params={{ resumeId: current.sourceResumeId }}>
								<Trans>Open source CV</Trans>
							</Link>
						)}
						{current.variantKind === "language" ? (
							<Link to="/dashboard/resumes/$resumeId/languages" params={{ resumeId }}>
								<Trans>Review language copy</Trans>
							</Link>
						) : (
							<Link to="/dashboard/resumes/$resumeId/job" params={{ resumeId }}>
								<Trans>Review job copy</Trans>
							</Link>
						)}
					</div>
				</>
			)}
		</section>
	);
}
