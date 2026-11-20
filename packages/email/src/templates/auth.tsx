import * as React from "react";
import { Body, Button, Container, Head, Heading, Html, Link, Preview, Text } from "react-email";
import { getProductName } from "@reactive-resume/utils/brand";
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
			<Body
				lang={locale}
				dir={locale === "ar-SA" ? "rtl" : "ltr"}
				style={{ margin: 0, backgroundColor: "#F1F0EB", color: "#1C1B15", fontFamily: "Arial, sans-serif" }}
			>
				<Container
					style={{
						maxWidth: 560,
						padding: "32px 24px",
						backgroundColor: "#FAF9F6",
						border: "1px solid #DDDCD6",
					}}
				>
					<Text style={{ margin: "0 0 24px", color: "#337344", fontSize: 20, fontWeight: 700 }}>
						{getProductName(locale)}
					</Text>
					<Heading style={{ margin: "0 0 16px", color: "#1C1B15", fontSize: 24, lineHeight: "32px" }}>
						{text("heading")}
					</Heading>
					<Text style={{ margin: "0 0 24px", color: "#4F4D47", fontSize: 16, lineHeight: "26px" }}>
						{[text("intro"), text("details"), text("outro")].join(" ")}
					</Text>
					<Button
						href={url}
						style={{ backgroundColor: "#337344", color: "#F7FEF8", padding: "14px 24px", borderRadius: 8 }}
					>
						{action}
					</Button>
					<Text style={{ margin: "24px 0 6px", color: "#4F4D47", fontSize: 14, lineHeight: "20px" }}>
						{authMailMessage("email.common.linkFallback", locale)}
					</Text>
					<Text style={{ margin: 0, color: "#66655E", fontSize: 12, lineHeight: "18px", overflowWrap: "anywhere" }}>
						<Link href={url} dir="ltr" style={{ color: "#66655E", overflowWrap: "anywhere", wordBreak: "break-all" }}>
							{url}
						</Link>
					</Text>
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
