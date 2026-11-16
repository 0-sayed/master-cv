import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@reactive-resume/ui/components/badge";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { cn } from "@reactive-resume/utils/style";
import { reveal } from "./reveal";
import { SectionIntro } from "./section";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";

// The free allowances enforced today by packages/api/src/features/ai/usage.ts (one base CV, one language version
// and one job copy per CV, five AI operations), plus the deterministic PDF readability check. The paid plan is
// planned (D05/B-C11, T010) and has no approved price, so it shows no amount, payment name or buy button.
const free = [
	"landing.pricing.free.cv",
	"landing.pricing.free.ai",
	"landing.pricing.free.review",
	"landing.pricing.free.ats",
	"landing.pricing.free.pdf",
] as const;
const planned = ["landing.pricing.paid.cvs", "landing.pricing.paid.copies", "landing.pricing.paid.ai"] as const;

export function Pricing() {
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	return (
		<section id="pricing" tabIndex={-1} aria-labelledby="pricing-title" className="bg-bg landing-section outline-none">
			<div className="landing-container grid items-center gap-10 lg:grid-cols-[2fr_5fr] lg:gap-12">
				<SectionIntro
					titleId="pricing-title"
					title={copy("landing.pricing.title")}
					body={copy("landing.pricing.body")}
				/>
				<div className="grid w-full items-stretch gap-6 md:grid-cols-2">
					<Plan
						reveal={0}
						tone="current"
						name={copy("landing.pricing.free.label")}
						badge={<Badge variant="accent">{copy("landing.pricing.free.badge")}</Badge>}
						headline={copy("landing.pricing.free.name")}
						note={copy("landing.pricing.free.note")}
						action={
							<Link
								to="/auth/register"
								search={{ locale, callbackURL: "/dashboard" }}
								className={buttonVariants({ size: "lg" })}
							>
								{copy("landing.hero.cta")}
								<Icon name="arrow-right" size={18} />
							</Link>
						}
						items={free.map((key) => ({ key, text: copy(key) }))}
						icon="check-circle"
					/>
					<Plan
						reveal={1}
						tone="planned"
						name={copy("landing.pricing.paid.name")}
						headline={copy("landing.pricing.soon")}
						note={copy("landing.pricing.paid.note")}
						items={planned.map((key) => ({ key, text: copy(key) }))}
						icon="hourglass"
					/>
				</div>
			</div>
		</section>
	);
}

type PlanProps = {
	reveal: number;
	tone: "current" | "planned";
	name: string;
	badge?: ReactNode;
	headline: string;
	note: string;
	action?: ReactNode;
	items: readonly { key: string; text: string }[];
	icon: "check-circle" | "hourglass";
};

/** One plan: name and status, the plan's headline in display type, its note and action, then what it includes. */
function Plan({ reveal: index, tone, name, badge, headline, note, action, items, icon }: PlanProps) {
	const current = tone === "current";
	return (
		<article
			{...reveal(index)}
			className={cn(
				"grid grid-rows-[auto_1fr] overflow-hidden rounded-3xl border",
				current ? "border-accent bg-raised shadow-e3" : "border-dashed border-line-2 bg-surface",
			)}
		>
			<div className={cn("grid content-start gap-3 p-6 lg:p-8", current && "bg-accent-soft/40")}>
				<div className="flex items-center justify-between gap-3">
					<h3 className="type-label text-ink-2">{name}</h3>
					{badge}
				</div>
				<p className={cn("type-title", current ? "text-ink" : "text-ink-3")}>{headline}</p>
				<p className="type-body text-ink-2">{note}</p>
				{action}
			</div>
			<ul className="grid content-start gap-3 border-t border-line p-6 lg:p-8">
				{items.map((item) => (
					<li key={item.key} className={cn("flex items-start gap-3 type-body", current ? "text-ink" : "text-ink-2")}>
						<Icon
							name={icon}
							size={20}
							className={cn("mt-0.5 shrink-0", current ? "text-accent-text" : "text-ink-3")}
						/>
						{item.text}
					</li>
				))}
			</ul>
		</article>
	);
}
