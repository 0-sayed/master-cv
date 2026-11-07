import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function restrictedPackages(licenses) {
	return Object.entries(licenses)
		.filter(([license]) => /(?:^|[\s(])A?GPL-3\.0(?:[\s).+-]|$)/.test(license))
		.flatMap(([license, packages]) => packages.map((pkg) => `${pkg.name}@${pkg.versions.join(",")}: ${license}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const report = JSON.parse(execFileSync("pnpm", ["licenses", "list", "--json"], { encoding: "utf8" }));
	const restricted = restrictedPackages(report);
	if (restricted.length) {
		console.error("Unapproved GPL-3.0/AGPL-3.0 dependencies require review:\n" + restricted.join("\n"));
		process.exitCode = 1;
	} else {
		console.info("No GPL-3.0/AGPL-3.0 dependencies found in the installed graph.");
	}
}
