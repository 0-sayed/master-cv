import { Trans } from "@lingui/react/macro";
import { Badge } from "@reactive-resume/ui/components/badge";

export function FeatureBetaBadge() {
	return (
		<Badge variant="neutral">
			<Trans context="feature.status.beta">Beta</Trans>
		</Badge>
	);
}
