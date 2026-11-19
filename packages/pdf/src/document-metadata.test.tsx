import { expect, it } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "./document";
import { renderHostTree } from "./forme/reconciler";
import { toFormeDocument } from "./forme/to-forme";

it("preserves authored Arabic identity, English headline and document language in PDF metadata", () => {
	const data = structuredClone(defaultResumeData);
	data.basics.name = "نواف السهلي";
	data.basics.headline = "Product operations analyst";
	data.metadata.page.locale = "ar-SA";
	data.picture.hidden = true;
	const tree = renderHostTree(<ResumeDocument data={data} template="onyx" />);
	const root = tree.find((node) => "type" in node && node.type === "rr-document");
	expect(root).toMatchObject({
		props: {
			title: data.basics.name,
			author: data.basics.name,
			creator: data.basics.name,
			subject: data.basics.headline,
			language: "ar-SA",
		},
	});
	const serialized = JSON.stringify(toFormeDocument(tree).document);
	for (const [key, value] of Object.entries({
		title: data.basics.name,
		author: data.basics.name,
		creator: data.basics.name,
		subject: data.basics.headline,
		lang: "ar-SA",
	}))
		expect(serialized).toContain(JSON.stringify(key) + ":" + JSON.stringify(value));
	expect(serialized).not.toMatch(/Master CV|Sirawise/);
});
