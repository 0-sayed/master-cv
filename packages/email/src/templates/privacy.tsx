import * as React from "react";
import { Html, Head, Body, Container, Text, Link } from "react-email";
import { getProductName } from "@reactive-resume/utils/brand";
import { authMessages } from "../auth-messages.generated";
void React;
export type PrivacyNoticeKind =
	| "export_ready"
	| "deletion_received"
	| "deletion_complete"
	| "security_change"
	| "support_received";
export function privacyMailText(kind: PrivacyNoticeKind, locale: "ar-SA" | "en-US") {
	return authMessages[`email.privacy.${kind}`][locale];
}
export function PrivacyEmail({
	kind,
	locale = "ar-SA",
	actionUrl,
	appUrl,
}: {
	kind: PrivacyNoticeKind;
	locale?: "ar-SA" | "en-US";
	actionUrl?: string | undefined;
	appUrl: string;
}) {
	if (actionUrl) {
		const url = new URL(actionUrl);
		if (url.origin !== new URL(appUrl).origin || url.username || url.password || url.search)
			throw new Error("PRIVACY_MAIL_LINK_DENIED");
	}
	return (
		<Html lang={locale} dir={locale === "ar-SA" ? "rtl" : "ltr"}>
			<Head />
			<Body>
				<Container>
					<Text>{getProductName(locale)}</Text>
					<Text>{privacyMailText(kind, locale)}</Text>
					{actionUrl && <Link href={actionUrl}>{authMessages["email.privacy.action"][locale]}</Link>}
				</Container>
			</Body>
		</Html>
	);
}
