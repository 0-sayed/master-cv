import { readFileSync } from "node:fs";
import { expect, it } from "vite-plus/test";
import { productBrand } from "@reactive-resume/utils/brand";

it("uses the approved static HTML and manifest names", () => {
	const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
	const manifest = JSON.parse(readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
	expect(manifest.name).toBe(productBrand.name);
	expect(manifest.short_name).toBe(productBrand.name);
	for (const name of ["application-name", "og:site_name", "twitter:title"]) {
		expect(html).toMatch(new RegExp(`(?:name|property)="${name}" content="${productBrand.name}`));
	}
	expect(html).toContain(`<title>${productBrand.name}`);
});
