import { Trans } from "@lingui/react/macro";
import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@reactive-resume/ui/components/button";
export function AtsCheckerPage({ signedIn }: { signedIn: boolean; importPending: boolean }) {
	return (
		<main id="main-content" className="grid min-h-svh content-center justify-items-center gap-4 bg-bg p-4">
			<h1 className="type-title">
				<Trans>Check your CV in your private workspace</Trans>
			</h1>
			<p className="type-body text-ink-2">
				<Trans>
					Import and review your CV, then check the exact PDF from its editor. No public file upload is available.
				</Trans>
			</p>
			<Link to={signedIn ? "/dashboard" : "/auth/login"} className={buttonVariants()}>
				<Trans>Open private workspace</Trans>
			</Link>
		</main>
	);
}
