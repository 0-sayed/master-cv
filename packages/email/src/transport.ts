import type { SendMailOptions, Transporter } from "nodemailer";
import type { ReactElement } from "react";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { render } from "react-email";
import { env } from "@reactive-resume/env/server";
import { productBrand } from "@reactive-resume/utils/brand";

type SendEmailOptions = { to: string; subject: string; react: ReactElement };

let cachedTransport: Transporter | undefined;

const getTransport = () => {
	const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: from } = env;
	if (!host || !user || !pass || !from) return;

	cachedTransport ??= nodemailer.createTransport({
		host,
		port: env.SMTP_PORT,
		secure: env.SMTP_SECURE,
		auth: { user, pass },
		connectionTimeout: 10_000,
		greetingTimeout: 10_000,
		socketTimeout: 10_000,
	});

	return cachedTransport;
};

export const sendEmail = async ({ to, subject, react }: SendEmailOptions) => {
	const transport = getTransport();
	if (!transport && process.env.NODE_ENV === "production") {
		throw new Error("Email could not be delivered. Please try again.");
	}
	const payload: SendMailOptions = {
		to,
		from: env.SMTP_FROM,
		subject,
		html: await render(react),
		text: await render(react, { plainText: true }),
	};

	if (!transport) {
		console.info("SMTP not configured; skipping email send.", {
			to: payload.to,
			subject: payload.subject,
			text: payload.text,
			html: payload.html,
		});
		return;
	}

	try {
		await transport.sendMail(payload);
	} catch {
		// SMTP errors can contain credentials or authentication links.
		console.error("There was an error sending mail.");
		throw new Error("Email could not be delivered. Please try again.");
	}
};

type SendCareerNotificationOptions = { to: string; subject: string; text: string; url: string; key: string };

/** Owner-only notifications: missing SMTP never logs personal career content. */
export async function sendCareerNotification({
	to,
	subject,
	text,
	url,
	key,
}: SendCareerNotificationOptions): Promise<boolean> {
	const transport = getTransport();
	if (!transport) return false;
	const link = new URL(url, env.APP_URL);
	if (link.origin !== new URL(env.APP_URL).origin)
		throw new Error("Career notification links must point to this application.");
	// The frozen study input keeps this legacy default. Custom notification text stays intact.
	const notificationText =
		text === "You have a career update in Master CV." ? `You have a career update in ${productBrand.name}.` : text;
	try {
		await transport.sendMail({
			to,
			from: env.SMTP_FROM,
			subject,
			text: `${notificationText}\n\n${link.toString()}`,
			messageId: `<career-${createHash("sha256").update(key).digest("hex")}@reactive-resume.local>`,
		});
		return true;
	} catch {
		// SMTP errors can contain recipient addresses, credentials or message fragments.
		throw new Error("Career notification email could not be delivered.");
	}
}

/** Privacy mail never falls back to console output or reports an unattempted send. */
export async function sendPrivacyEmail(input: SendEmailOptions & { key: string }): Promise<void> {
	if (!/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/.test(input.to) || input.to.length > 254)
		throw new Error("PRIVACY_MAIL_RECIPIENT_INVALID");
	const transport = getTransport();
	if (!transport) throw new Error("PRIVACY_MAIL_UNAVAILABLE");
	const html = await render(input.react);
	const text = await render(input.react, { plainText: true });
	try {
		await transport.sendMail({
			to: input.to,
			from: env.SMTP_FROM,
			subject: input.subject,
			html,
			text,
			messageId: `<privacy-${createHash("sha256").update(input.key).digest("hex")}@master-cv.local>`,
		});
	} catch (error) {
		const responseCode =
			typeof error === "object" && error !== null && "responseCode" in error ? error.responseCode : undefined;
		throw new Error(
			typeof responseCode === "number" && responseCode >= 500 && responseCode <= 599
				? "PRIVACY_MAIL_REJECTED"
				: "PRIVACY_MAIL_RETRY_REQUIRED",
		);
	}
}
