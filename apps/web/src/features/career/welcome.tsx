import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { AuthErrorSummary } from "../auth/components/auth-error-summary";
import { useCareerCopy } from "./copy.generated";
import { client } from "@/libs/orpc/client";

export function WelcomePage() {
	const copy = useCareerCopy();
	const { session } = useRouteContext({ from: "/dashboard" });
	const navigate = useNavigate();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function complete(to: "/dashboard" | "/dashboard/career/information") {
		setPending(true);
		setError(null);
		try {
			await client.career.personalWorkspace.completeWelcome({});
			await navigate({ to, replace: true });
		} catch {
			setError(t`Could not save your choice. Please try again.`);
		} finally {
			setPending(false);
		}
	}
	return (
		<div className="mx-auto grid w-full max-w-[996px] content-start gap-4 px-[18px] pt-7 pb-8 lg:gap-8 lg:pt-12 lg:pb-10">
			<header className="space-y-1 text-start">
				<h1 className="type-title-s lg:type-title">{copy("auth.welcome.title", { name: session.user.name })}</h1>
				<p className="text-sm leading-[23px] text-ink-2">{copy("auth.welcome.subtitle")}</p>
			</header>
			<div className="grid gap-4 lg:grid-cols-3 lg:gap-6">
				{(["import", "review", "export"] as const).map((step, index) => (
					<section
						key={step}
						className="grid grid-cols-[40px_1fr] items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface p-4 lg:grid-cols-1 lg:justify-items-start lg:gap-4 lg:p-6"
					>
						<Icon
							name={index === 0 ? "upload-simple" : index === 1 ? "list-checks" : "download-simple"}
							size={20}
							className="row-span-2 box-content rounded-md bg-accent-soft p-2.5 text-accent-text lg:row-span-1"
						/>
						<h2 className="text-base leading-[26px] font-semibold lg:text-[19px] lg:leading-7">
							{copy(`auth.welcome.${step}.title`)}
						</h2>
						<p className="col-start-2 text-sm leading-[23px] text-ink-2 lg:col-start-auto">
							{copy(`auth.welcome.${step}.description`)}
						</p>
					</section>
				))}
			</div>
			<div className="rounded-xl bg-info-soft p-4 text-info-text">
				<h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
					<Icon name="info" size={16} />
					{copy("auth.welcome.privacy.title")}
				</h2>
				<p className="text-sm leading-[23px]">
					<Trans>
						Start by adding your career information yourself. File import and AI assistance are not enabled yet.
					</Trans>
				</p>
			</div>
			<AuthErrorSummary message={error} />
			<div className="flex flex-col gap-3 lg:flex-row">
				<Button className="h-12" loading={pending} onClick={() => void complete("/dashboard/career/information")}>
					{copy("auth.welcome.start")}
				</Button>
				<Button variant="link" className="min-h-12" disabled={pending} onClick={() => void complete("/dashboard")}>
					{copy("auth.welcome.explore")}
				</Button>
			</div>
		</div>
	);
}
