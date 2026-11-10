import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { queryLoadingViolations } from "./query-loading";

it("rejects query spinners and visible loading copy but allows explicit action indicators", () => {
	expect(queryLoadingViolations("if (query.isPending) return <Spinner />;", "page.tsx")).not.toEqual([]);
	expect(queryLoadingViolations("if (query.isPending) return <LoadingScreen />;", "page.tsx")).not.toEqual([]);
	expect(queryLoadingViolations("const route = { pendingComponent: LoadingScreen };", "route.tsx")).not.toEqual([]);
	expect(
		queryLoadingViolations("return isLoading ? <p><Trans>Loading records…</Trans></p> : <List />;", "panel.tsx"),
	).not.toEqual([]);
	expect(queryLoadingViolations("return pending ? <p>Loading…</p> : <List />;", "panel.tsx")).not.toEqual([]);
	expect(queryLoadingViolations("return pending ? <p>{t`Loading records…`}</p> : <List />;", "panel.tsx")).not.toEqual(
		[],
	);
	expect(
		queryLoadingViolations("return <QuerySkeleton loading={query.isPending}><List /></QuerySkeleton>;", "panel.tsx"),
	).toEqual([]);
	expect(queryLoadingViolations("return <Button loading={save.isPending}>Save</Button>;", "panel.tsx")).toEqual([]);
});

it("keeps all web route/page/panel content free of unclassified query loaders", () => {
	const root = fileURLToPath(new URL("../../apps/web/src", import.meta.url));
	const files = (directory: string): string[] =>
		readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
			entry.isDirectory()
				? files(join(directory, entry.name))
				: entry.name.endsWith(".tsx") && !entry.name.includes(".test.")
					? [join(directory, entry.name)]
					: [],
		);
	const errors = files(root).flatMap((path) =>
		queryLoadingViolations(readFileSync(path, "utf8"), path.slice(root.length + 1)),
	);
	expect(errors).toEqual([]);
});
