import { afterEach, expect, it, vi } from "vite-plus/test";
import { formatter } from "@lingui/format-po";

const files = vi.hoisted(() => new Map<string, string>());
vi.mock("node:fs/promises", () => ({
	readFile: async (path: URL) => {
		const value = files.get(path.pathname);
		if (value === undefined) throw new Error(`Missing fixture: ${path.pathname}`);
		return value;
	},
	writeFile: async (path: URL, content: string) => {
		files.set(path.pathname, content);
	},
}));

afterEach(() => {
	files.clear();
	vi.resetModules();
});

it("synchronizes active auth-route copy from the deck without updating unrelated or obsolete messages", async () => {
	const format = formatter({ lineNumbers: false });
	const source = [
		'#: src/routes/auth/native-callback.tsx\nmsgid "Native callback"\nmsgstr "Old callback"\n',
		'#: src/features/legacy/example.tsx\nmsgid "Legacy copy"\nmsgstr "Old legacy"\n',
		'#: src/routes/auth/native-callback.tsx\n#~ msgid "Obsolete callback"\n#~ msgstr "Old obsolete"\n',
	].join("\n");
	const parsed = await format.parse(source, { locale: "en-US", sourceLocale: "en-US", filename: "en-US.po" });
	const entries = Object.entries(parsed).map(([runtimeId, message]) => ({
		lingui: { runtimeId },
		key: message.message,
		messages: { "en-US": `Updated ${message.message}`, "ar-SA": `محدث ${message.message}` },
	}));
	files.set(
		new URL("../../Planning/context/design/copy-deck.json", import.meta.url).pathname,
		JSON.stringify({ entries }),
	);
	for (const locale of ["en-US", "ar-SA"])
		files.set(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url).pathname, source);

	await import("./sync-workspace-catalogs");

	for (const locale of ["en-US", "ar-SA"]) {
		const output = files.get(new URL(`../../apps/web/locales/${locale}.po`, import.meta.url).pathname);
		const catalog = await format.parse(output ?? "", { locale, sourceLocale: "en-US", filename: `${locale}.po` });
		const messages = Object.fromEntries(
			Object.values(catalog).map((message) => [message.message, message.translation]),
		);
		expect(messages["Native callback"]).toBe(locale === "en-US" ? "Updated Native callback" : "محدث Native callback");
		expect(messages["Legacy copy"]).toBe("Old legacy");
		expect(messages["Obsolete callback"]).toBe("Old obsolete");
	}
});
