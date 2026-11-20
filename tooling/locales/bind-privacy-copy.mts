import { readFile, writeFile } from "node:fs/promises";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
const path = new URL("../../Planning/context/design/copy-deck.json", import.meta.url);
const deck = JSON.parse(await readFile(path, "utf8")) as {
	entries: Array<{ key: string; messages: Record<string, string>; lingui: { runtimeId: string; msgctxt: string } }>;
};
for (const entry of deck.entries) {
	if (!entry.key.startsWith("workspace.privacy.") && !entry.key.startsWith("email.privacy.")) continue;
	const message = entry.messages["en-US"];
	if (!message) throw new Error(`Missing English message: ${entry.key}`);
	entry.lingui.runtimeId = generateMessageId(message, entry.lingui.msgctxt);
}
await writeFile(path, JSON.stringify(deck, null, "\t") + "\n");
import { formatter } from "@lingui/format-po";
const catalog = await formatter().parse(
	await readFile(new URL("../../apps/web/locales/en-US.po", import.meta.url), "utf8"),
	{ locale: "en-US", sourceLocale: "en-US", filename: "en-US.po" },
);
const inventoryPath = new URL("./active-surfaces.json", import.meta.url);
const inventory = JSON.parse(await readFile(inventoryPath, "utf8")) as {
	surfaces: Array<{ id: string; sources: string[]; excludeSources?: string[]; keys: string[] }>;
};
const selectedKeys = new Set(process.argv.slice(2));
const targeted = selectedKeys.size > 0;

for (const surface of inventory.surfaces) {
	const matched = deck.entries
		.filter((e) => {
			if (targeted && !selectedKeys.has(e.key)) return false;
			const message = catalog[e.lingui.runtimeId];
			return (
				message &&
				!message.obsolete &&
				message.origin?.some(
					([path]) =>
						surface.sources.some((source: string) => path.startsWith(source)) &&
						!surface.excludeSources?.some((source: string) => path.startsWith(source)),
				)
			);
		})
		.map((e) => e.key);
	const prior = (surface.keys ?? []).filter((key) => !targeted || !selectedKeys.has(key));
	surface.keys = [...new Set([...prior, ...matched])].filter(
		(key) =>
			surface.id !== "settings" ||
			![
				"workspace.documents.cancel_dEgA5A",
				"workspace.documents.rename_2wxgft",
				"workspace.documents.try.again_KDw4GX",
			].includes(key),
	);
}
await writeFile(inventoryPath, JSON.stringify(inventory, null, "\t") + "\n");
