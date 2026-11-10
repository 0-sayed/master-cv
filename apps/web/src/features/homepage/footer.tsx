import type { ReactNode } from "react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { BrandIcon } from "@reactive-resume/ui/components/brand-icon";
import { cn } from "@reactive-resume/utils/style";
import { SCENE } from "./scroll";
import { labelClass } from "./ui";

const githubUrl = "https://github.com/0-sayed/master-cv";
const licenseUrl = `${githubUrl}/blob/main/LICENSE`;
const linkClass = "text-ink transition-colors hover:text-accent-text";

type FooterLink = { label: string; href: string } | { label: string; to: "/ats-checker" | "/dashboard" };

const getColumns = (): { id: string; title: string; links: FooterLink[] }[] => [
	{
		id: "product",
		title: t`Product`,
		links: [
			{ label: t`Templates`, href: "#design" },
			{ label: t`Features`, href: "#write" },
			{ label: t`ATS checker`, to: "/ats-checker" },
			{ label: t`Get started`, to: "/dashboard" },
		],
	},
	{
		id: "resources",
		title: t`Resources`,
		links: [
			{ label: t`Source code`, href: githubUrl },
			{ label: t`Report an issue`, href: `${githubUrl}/issues` },
			{ label: t`Upstream documentation`, href: "https://docs.rxresu.me" },
		],
	},
	{
		id: "legal",
		title: t`Legal`,
		links: [{ label: t`MIT License`, href: licenseUrl }],
	},
];

function FooterLinkItem({ link }: { link: FooterLink }): ReactNode {
	if ("to" in link) {
		return (
			<Link to={link.to} className={linkClass}>
				{link.label}
			</Link>
		);
	}
	return (
		<a href={link.href} className={linkClass}>
			{link.label}
		</a>
	);
}

/** 13 Footer, ending on the wordmark rising into view, cropped by the page's edge. */
export function LandingFooter() {
	return (
		<footer data-scene={SCENE.footer} className="relative overflow-hidden border-t border-line">
			<div className="mx-auto grid max-w-[1440px] grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-8 gap-y-10 px-(--gutter) pt-16">
				<div className="col-span-2 flex min-w-0 flex-col gap-3.5">
					<BrandIcon variant="logo" />
					<div className="flex flex-col gap-1 font-ui text-[13px] leading-normal text-ink-3">
						<p>{t`By the community, for the community.`}</p>
						<p>
							<Trans>
								Licensed under{" "}
								<a
									href={licenseUrl}
									className="text-accent-text underline underline-offset-[3px] transition-colors hover:text-accent-hover"
								>
									MIT
								</a>
							</Trans>
						</p>
						<p>v{__APP_VERSION__}</p>
					</div>
				</div>

				{getColumns().map((column) => (
					<nav
						key={column.id}
						aria-labelledby={`footer-${column.id}`}
						className="flex flex-col gap-2.5 font-ui text-sm"
					>
						<h2 id={`footer-${column.id}`} className={cn(labelClass, "mb-1 text-ink-3")}>
							{column.title}
						</h2>
						<ul className="flex flex-col gap-2.5">
							{column.links.map((link) => (
								<li key={link.label}>
									<FooterLinkItem link={link} />
								</li>
							))}
						</ul>
						{column.id === "legal" && (
							<p data-upstream-credit className="type-metadata text-ink-3">
								<Trans>Built on Reactive Resume by Amruth Pillai, licensed under MIT.</Trans>
							</p>
						)}
					</nav>
				))}
			</div>

			{/* It fades in by sliding up out of the mask's faded bottom; an opacity fade would fail contrast checks. */}
			<div aria-hidden="true" className="@container mx-auto mt-14 max-w-[1440px] px-(--gutter)">
				<div className="h-[27cqw] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_35%,transparent_100%)]">
					<div className="font-anybody [transform:translateY(calc((1-clamp(0,(var(--p)-.1)/.8,1))*60%))] pt-[.12em] pb-[.06em] text-[17.5cqw] leading-[.84] font-extrabold tracking-[-.035em] whitespace-nowrap text-ink font-stretch-[78%] select-none [transition:transform_.35s_var(--ease)]">
						<span className="block">Master</span>
						<span className="block text-accent-text">CV</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
