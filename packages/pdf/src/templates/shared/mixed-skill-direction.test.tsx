import type { HostNode } from "../../forme/reconciler";
import { expect, it } from "vite-plus/test";
import { act } from "react";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { ResumeDocument } from "../../document";
import { renderHostTree } from "../../forme/reconciler";

it("keeps a mixed-script skill unchanged in an English document", async () => {
	const data = structuredClone(defaultResumeData);
	data.metadata.page.locale = "en-US";
	data.metadata.layout.pages = [{ fullWidth: true, main: ["skills"], sidebar: [] }];
	const name = "تحليل البيانات / Python";
	data.sections.skills.items = [
		{ id: "skill", hidden: false, name, proficiency: "", level: 0, keywords: [], icon: "", iconColor: "" },
	];
	const tree = await act(() => renderHostTree(<ResumeDocument data={data} template="onyx" />));
	const strings = (node: HostNode): string[] => ("text" in node ? [node.text] : node.children.flatMap(strings));
	expect(tree.flatMap(strings).filter((text) => text.includes("Python"))).toEqual([name]);
});
