import type { DocumentSummary } from "./filter";
import { t } from "@lingui/core/macro";
import { Badge } from "@reactive-resume/ui/components/badge";
import { documentCardLayout } from "@reactive-resume/ui/components/document-card-layout";
import { Icon } from "@reactive-resume/ui/components/icon";
import { getStageColor, getStageLabel } from "@/features/applications/stages";

type DocumentDetailsProps = { document: DocumentSummary };

/** Saved document language stays independent of the interface language. */
function DocumentLanguage({ document }: DocumentDetailsProps) {
	const locale = document.metadata?.locale;
	if (!locale) return null;
	let language: string;
	let name: string | undefined;
	try {
		language = new Intl.Locale(locale).language;
		name = new Intl.DisplayNames([locale], { type: "language" }).of(language);
	} catch {
		return null;
	}
	return (
		<Badge
			variant="outline"
			aria-label={
				language === "ar"
					? t({ message: "Arabic", context: "letter.card.language" })
					: language === "en"
						? t({ message: "English", context: "letter.card.language" })
						: name
			}
		>
			{name}
		</Badge>
	);
}

export function DocumentApplication({ document }: DocumentDetailsProps) {
	const application = document.application;
	return (
		<span data-slot="document-application" className={documentCardLayout.application}>
			<span dir="auto" className={documentCardLayout.applicationName}>
				{application ? [application.role, application.company].filter(Boolean).join(" · ") : t`Not linked`}
			</span>
			{document.type === "letter" && application && (
				<span className={documentCardLayout.stage}>
					<span
						data-slot="stage-dot"
						aria-hidden="true"
						className={documentCardLayout.stageDot}
						style={{ backgroundColor: getStageColor(application.status) }}
					/>
					{getStageLabel(application.status)}
				</span>
			)}
		</span>
	);
}

export function DocumentMetadata({ document }: DocumentDetailsProps) {
	return (
		<div data-slot="document-badges" className={documentCardLayout.metadata}>
			<DocumentLanguage document={document} />
			{document.type === "letter" && document.letterStatus && (
				<Badge variant="neutral">
					{document.letterStatus === "sent" && <Icon name="lock" size={12} />}
					{document.letterStatus === "sent" ? t({ message: "Sent", context: "letter.card.status" }) : t`Draft`}
				</Badge>
			)}
		</div>
	);
}

/** No draft, history, snapshot, application-list, or renderer requests per card. */
export function LetterCardDetails({ document }: DocumentDetailsProps) {
	return (
		<>
			<DocumentMetadata document={document} />
			<DocumentApplication document={document} />
		</>
	);
}
