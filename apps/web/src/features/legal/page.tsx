import type { LegalTab } from "./search";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@reactive-resume/ui/components/tabs";
import { PublicShell } from "@/features/help/public-shell";
import { LandingFooter } from "@/features/homepage/footer";
import { LandingHeader } from "@/features/homepage/header";
import { useUiLocale } from "@/features/locale/provider";
import { usePublicCopy } from "@/features/public-copy";
import { PrivacyNotice } from "@/features/settings/privacy/notice";
import { usePublicSeo } from "@/libs/public-seo";
export function LegalPage({ tab }: { tab: LegalTab }) {
	usePublicSeo("privacy-and-terms");
	const copy = usePublicCopy();
	const { locale } = useUiLocale();
	const navigate = useNavigate();
	return (
		<PublicShell title={copy("legal.page.title")} headerActions={<LandingHeader />} footer={<LandingFooter />}>
			<PrivacyNotice title={copy("legal.draft.notice")}>{copy("legal.draft.revision")}</PrivacyNotice>
			<Tabs
				value={tab}
				onValueChange={(value) => {
					void navigate({ to: "/privacy-and-terms", search: { locale, tab: value === "terms" ? "terms" : "privacy" } });
				}}
			>
				<TabsList variant="line" size="touch" aria-label={copy("legal.page.title")}>
					<TabsTrigger value="privacy">{copy("legal.tab.privacy")}</TabsTrigger>
					<TabsTrigger value="terms">{copy("legal.tab.terms")}</TabsTrigger>
				</TabsList>
				<TabsContent value="privacy" keepMounted>
					<div className="grid max-w-prose gap-8 py-6">
						{(["data", "rights", "deletion", "retention"] as const).map((section) => (
							<section key={section} className="grid gap-3">
								<h2 className="type-heading">{copy(`legal.privacy.${section}.title`)}</h2>
								<p className="type-body text-ink-2">{copy(`legal.privacy.${section}.body`)}</p>
							</section>
						))}
						<section className="grid gap-3">
							<h2 className="type-heading">
								<Trans context="privacy.policy.purposeTitle">How we use it</Trans>
							</h2>
							<p className="type-body text-ink-2">{copy("privacy.policy.purposeDescription")}</p>
						</section>
					</div>
				</TabsContent>
				<TabsContent value="terms" keepMounted>
					<div className="grid max-w-prose gap-8 py-6">
						{(["capabilities", "approval"] as const).map((section) => (
							<section key={section} className="grid gap-3">
								<h2 className="type-heading">{copy(`legal.terms.${section}.title`)}</h2>
								<p className="type-body text-ink-2">{copy(`legal.terms.${section}.body`)}</p>
							</section>
						))}
					</div>
				</TabsContent>
			</Tabs>
			<div className="flex flex-wrap gap-4">
				<Link to="/dashboard/settings/privacy" search={{ locale }} className={buttonVariants()}>
					{copy("legal.navigation.data")}
				</Link>
				<Link to="/help" search={{ locale }} className={buttonVariants({ variant: "secondary" })}>
					{" "}
					<Trans context="help.page.title">Help and contact</Trans>
				</Link>
			</div>
		</PublicShell>
	);
}
