import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";
// eslint-disable-next-line no-restricted-imports -- Test-only read of generated copy verifies the captured locale without adding production exports.
import { authMessages } from "../../../packages/email/src/auth-messages.generated";

export async function capturedPrivacyNotice(
	email: string,
	kind: "export_ready" | "deletion_received" | "deletion_complete" | "support_received",
	locale: "en-US" | "ar-SA",
	after = 0,
) {
	const directory = resolve(process.env.E2E_MAIL_DIRECTORY ?? "test-results/mail");
	const key = createHash("sha256").update(email.toLowerCase()).digest("hex");
	let result: { kind: typeof kind; locale: typeof locale; recipient: string; actionUrl: string | null } | undefined;
	await expect
		.poll(
			async () => {
				for (const file of (await readdir(directory))
					.filter((file) => file.startsWith(key))
					.sort()
					.reverse()) {
					const mail = JSON.parse(await readFile(resolve(directory, file), "utf8")) as {
						raw: string;
						at: number;
						recipient: string;
					};
					if (mail.at < after || mail.recipient.toLowerCase() !== email.toLowerCase()) continue;
					const decoded = Buffer.from(
						mail.raw
							.replace(/=\r?\n/g, "")
							.replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))),
						"latin1",
					)
						.toString("utf8")
						.replaceAll("&amp;", "&");
					if (!decoded.includes(authMessages[`email.privacy.${kind}`][locale])) continue;
					expect(decoded).toContain(`lang="${locale}"`);
					expect(decoded).toContain(`dir="${locale === "ar-SA" ? "rtl" : "ltr"}"`);
					const links = decoded.match(/https?:\/\/[^\s<>"\]]+/g) ?? [];
					const actionUrl = links.find((url) => url.includes("/dashboard/settings/privacy")) ?? null;
					if (actionUrl) {
						const url = new URL(actionUrl);
						expect(url.origin).toBe(process.env.APP_URL);
						expect(url.search).toBe("");
					}
					result = { kind, locale, recipient: mail.recipient, actionUrl };
					return true;
				}
				return false;
			},
			{ timeout: 15000, message: "Synthetic privacy notice must reach the offline mail sink" },
		)
		.toBe(true);
	if (!result) throw new Error("Privacy notice absent");
	return result;
}

export async function capturedAuthLink(
	email: string,
	kind: "verification" | "reset" | "email_change",
	after = 0,
): Promise<string> {
	const directory = resolve(process.env.E2E_MAIL_DIRECTORY ?? "test-results/mail");
	const key = createHash("sha256").update(email.toLowerCase()).digest("hex");
	let result = "";
	await expect
		.poll(
			async () => {
				const files = (await readdir(directory))
					.filter((file) => file.startsWith(key))
					.sort()
					.reverse();
				for (const file of files) {
					const mail = JSON.parse(await readFile(resolve(directory, file), "utf8")) as { raw: string; at: number };
					if (mail.at < after) continue;
					const decoded = mail.raw
						.replace(/=\r?\n/g, "")
						.replace(/=([0-9A-F]{2})/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
						.replaceAll("&amp;", "&");
					const urls = decoded.match(/https?:\/\/[^\s<>"\]]+/g) ?? [];
					const found = urls.find((url) =>
						url.includes(
							kind === "verification"
								? "/api/auth/verify-email?token="
								: kind === "email_change"
									? "/api/auth/confirm-email-change?token="
									: "/api/auth/reset-password/",
						),
					);
					if (found) {
						result = found;
						return true;
					}
				}
				return false;
			},
			{ timeout: 15000, message: "A real auth message must reach the synthetic SMTP capture" },
		)
		.toBe(true);
	return result;
}
