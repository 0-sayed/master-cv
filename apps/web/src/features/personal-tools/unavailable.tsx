import { Trans } from "@lingui/react/macro";
import { Link, useLocation } from "@tanstack/react-router";
import { deferredRoute, isFeatureAvailable } from "@reactive-resume/schema/personal-tools";
import { Alert, AlertTitle, AlertDescription, AlertActions } from "@reactive-resume/ui/components/alert";
import { BackNavigation } from "@reactive-resume/ui/components/back-navigation";
import { Icon } from "@reactive-resume/ui/components/icon";
import { NotFoundScreen } from "@/components/layout/not-found-screen";

export function FeatureUnavailable() {
	return (
		<Alert variant="info">
			<Icon name="info" />
			<AlertTitle>
				<Trans>Not available</Trans>
			</AlertTitle>
			<AlertDescription>
				<Trans>This feature is not available.</Trans>
			</AlertDescription>
			<AlertActions>
				<BackNavigation render={<Link to="/dashboard" />}>
					<Trans>Back to documents</Trans>
				</BackNavigation>
			</AlertActions>
		</Alert>
	);
}

/** Unknown URLs retain their missing-page recovery; only withheld routes use the feature notice. */
export function DeferredRouteNotFound() {
	const { pathname } = useLocation();
	const feature = deferredRoute(pathname);
	return feature && !isFeatureAvailable(feature) ? <FeatureUnavailable /> : <NotFoundScreen />;
}
