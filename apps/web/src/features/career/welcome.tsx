import { t } from "@lingui/core/macro";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@reactive-resume/ui/components/button";
import { Icon } from "@reactive-resume/ui/components/icon";
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
		<div className="contents">
			<PageHeader
				title={copy("auth.welcome.title", { name: session.user.name })}
				description={copy("auth.welcome.subtitle")}
			/>
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
						<h2 className="type-section">{copy(`auth.welcome.${step}.title`)}</h2>
						<p className="col-start-2 type-body text-ink-2 lg:col-start-auto">
							{copy(`auth.welcome.${step}.description`)}
						</p>
					</section>
				))}
			</div>
			<AuthErrorSummary message={error} />
			<div className="flex flex-col gap-3 lg:flex-row">
				<Button size="lg" loading={pending} onClick={() => void complete("/dashboard/career/information")}>
					{copy("auth.welcome.start")}
				</Button>
				<Button variant="link" size="link-touch" disabled={pending} onClick={() => void complete("/dashboard")}>
					{copy("auth.welcome.explore")}
				</Button>
			</div>
		</div>
	);
}
