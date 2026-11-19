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

it("synchronizes active auth, account and application copy without updating unrelated or obsolete messages", async () => {
	const format = formatter({ lineNumbers: false });
	const source = [
		'#: src/routes/auth/native-callback.tsx\nmsgid "Native callback"\nmsgstr "Old callback"\n',
		'#: src/features/user/dropdown-menu.tsx\nmsgid "Account menu"\nmsgstr "Old menu"\n',
		'#: src/features/ats-guide/copy.ts\nmsgid "Review guide"\nmsgstr "Old guide"\n',
		'#: src/features/homepage/header.tsx\nmsgid "Open my workspace"\nmsgstr "Old workspace action"\n',
		'#: src/features/applications/components/import-applications-sheet.tsx\nmsgid "Choose file"\nmsgstr "Old file choice"\n',
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
		expect(messages["Account menu"]).toBe(locale === "en-US" ? "Updated Account menu" : "محدث Account menu");
		expect(messages["Review guide"]).toBe(locale === "en-US" ? "Updated Review guide" : "محدث Review guide");
		expect(messages["Open my workspace"]).toBe(
			locale === "en-US" ? "Updated Open my workspace" : "محدث Open my workspace",
		);
		expect(messages["Choose file"]).toBe(locale === "en-US" ? "Updated Choose file" : "محدث Choose file");
		expect(messages["Legacy copy"]).toBe("Old legacy");
		expect(messages["Obsolete callback"]).toBe("Old obsolete");
	}
});
