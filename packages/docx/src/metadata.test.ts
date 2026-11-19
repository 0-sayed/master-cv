import assert from "node:assert/strict";
// @vitest-environment happy-dom
import { expect, it } from "vite-plus/test";
import { strFromU8, unzipSync } from "fflate";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { buildDocx } from "./index";

it("preserves authored document values without inserting product branding into DOCX properties", async () => {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "نواف السهلي";
	data.basics.headline = "Product operations analyst";
	data.metadata.page.locale = "ar-SA";
	data.picture.hidden = true;
	const files = unzipSync(new Uint8Array(await (await buildDocx(data)).arrayBuffer()));
	for (const name of ["docProps/core.xml", "docProps/app.xml"]) {
		const file = files[name];
		assert.ok(file);
		expect(strFromU8(file)).not.toMatch(/Master CV|Reactive Resume|Sirawise/);
	}
	const document = files["word/document.xml"];
	assert.ok(document);
	const xml = strFromU8(document);
	expect(xml).toContain(data.basics.name);
	expect(xml).toContain(data.basics.headline);
});
