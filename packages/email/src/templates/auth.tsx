import * as React from "react";
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from "react-email";
import { authMessages } from "../auth-messages.generated";
void React;
export type AuthMailLocale = "ar-SA" | "en-US";
export const authMailMessage = (key: keyof typeof authMessages, locale: AuthMailLocale) => authMessages[key][locale];
type Props = { url: string; locale?: AuthMailLocale };
function Layout({
	url,
	locale = "ar-SA",
	kind,
	values = {},
}: Props & { kind: "verification" | "reset" | "emailChange"; values?: Record<string, string> }) {
	const text = (suffix: string) => {
		const key = `email.${kind}.${suffix}` as keyof typeof authMessages;
		return authMailMessage(key, locale).replace(/\{(\w+)\}/g, (match, name: string) => values[name] ?? match);
	};
	const preview = kind === "verification" ? text("previewSubject") : text("preview");
	const action = kind === "verification" ? text("previewAction") : text("action");
	return (
		<Html lang={locale} dir={locale === "ar-SA" ? "rtl" : "ltr"}>
			<Head />
			<Preview>{preview}</Preview>
			<Body style={{ margin: 0, backgroundColor: "#faf8f4", color: "#172e29", fontFamily: "Arial, sans-serif" }}>
				<Container style={{ maxWidth: 560, padding: 32 }}>
					<Text>Master CV</Text>
					<Heading>{text("heading")}</Heading>
					<Text>{text("intro")}</Text>
					<Text>{text("details")}</Text>
					<Button
						href={url}
						style={{ backgroundColor: "#172e29", color: "#fff", padding: "12px 24px", borderRadius: 8 }}
					>
						{action}
					</Button>
					<Text>
						<Link href={url} dir="ltr" style={{ overflowWrap: "anywhere" }}>
							{url}
						</Link>
					</Text>
					<Text>{text("outro")}</Text>
				</Container>
			</Body>
		</Html>
	);
}
export function VerifyEmail(props: Props) {
	return <Layout {...props} kind="verification" />;
}
export function ResetPasswordEmail(props: Props) {
	return <Layout {...props} kind="reset" />;
}
export function VerifyEmailChange({
	previousEmail,
	newEmail,
	...props
}: Props & { previousEmail: string; newEmail: string }) {
	return <Layout {...props} kind="emailChange" values={{ previousEmail, newEmail }} />;
}
