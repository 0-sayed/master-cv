import { t } from "@lingui/core/macro";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@reactive-resume/ui/components/alert";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
import { SectionCard } from "@reactive-resume/ui/components/section-card";
import { AuthErrorSummary } from "../auth/components/auth-error-summary";
import { useCareerCopy } from "./copy.generated";
import { PageHeader } from "@/components/layout/page-header";
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
		<SectionCard aria-labelledby="welcome-title" variant="spacious">
			<PageHeader
				title={<span id="welcome-title">{copy("auth.welcome.title", { name: session.user.name })}</span>}
				description={copy("auth.welcome.subtitle")}
			/>
			<Button
				size="lg"
				loading={pending}
				className="w-full sm:w-fit"
				onClick={() => void complete("/dashboard/career/information")}
			>
				{copy("auth.welcome.start")}
			</Button>
			<AuthErrorSummary message={error} />
			<ol className="grid divide-y divide-line border-y border-line">
				{(["import", "review", "export"] as const).map((step, index) => {
					const sourceTitle = copy(`auth.welcome.${step}.title`);
					const title = sourceTitle.replace(/^[\p{Nd}]+\.\s*/u, "");
					return (
						<li key={step} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
							<bdi
								dir="ltr"
								className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft type-label text-accent-text"
							>
								{index + 1}
							</bdi>
							<div className="grid min-w-0 gap-1">
								<h2 className="type-section">{title}</h2>
								<p className="type-body text-ink-2">{copy(`auth.welcome.${step}.description`)}</p>
							</div>
						</li>
					);
				})}
			</ol>
			<Alert variant="info">
				<Icon name="info" />
				<div className="grid gap-1">
					<AlertTitle>{copy("auth.welcome.privacy.title")}</AlertTitle>
					<AlertDescription>{copy("auth.welcome.privacy.description")}</AlertDescription>
				</div>
			</Alert>
			<Button variant="link" size="link-touch" disabled={pending} onClick={() => void complete("/dashboard")}>
				{copy("auth.welcome.explore")}
			</Button>
		</SectionCard>
	);
}
