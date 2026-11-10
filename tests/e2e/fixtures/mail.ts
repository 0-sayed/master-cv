import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect } from "@playwright/test";

export async function capturedAuthLink(email: string, kind: "verification" | "reset", after = 0): Promise<string> {
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
						url.includes(kind === "verification" ? "/api/auth/verify-email?token=" : "/api/auth/reset-password/"),
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
