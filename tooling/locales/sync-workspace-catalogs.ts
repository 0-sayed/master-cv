import { readFile, writeFile } from "node:fs/promises";
import { formatter } from "@lingui/format-po";
const deck = JSON.parse(
	await readFile(new URL("../../Planning/context/design/copy-deck.json", import.meta.url), "utf8"),
) as { entries: Array<{ key: string; messages: Record<string, string>; lingui: { runtimeId: string } }> };
const format = formatter({ lineNumbers: false });
for (const locale of ["en-US", "ar-SA"]) {
	const path = new URL(`../../apps/web/locales/${locale}.po`, import.meta.url);
	const filename = `${locale}.po`;
	const existing = await readFile(path, "utf8");
	const catalog = await format.parse(existing, { locale, sourceLocale: "en-US", filename });
	for (const entry of deck.entries) {
		const message = catalog[entry.lingui.runtimeId];
		if (
			message &&
			!message.obsolete &&
			message.origin?.some(([path]) =>
				/src\/(features\/(auth|career|documents|resume|ats-checker)|routes\/(auth|dashboard|builder))\//.test(path),
			)
		)
			message.translation = entry.messages[locale] ?? "";
	}
	await writeFile(path, await format.serialize(catalog, { locale, sourceLocale: "en-US", filename, existing }));
	if (locale === "ar-SA")
		for (const message of Object.values(catalog))
			if (
				!message.obsolete &&
				!message.translation &&
				message.origin?.some(([path]) => /src\/features\/(auth|career\/information)/.test(path))
			)
				console.info(message.message);
}
