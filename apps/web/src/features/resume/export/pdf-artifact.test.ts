import type { createResumePdfBlob } from "./pdf-document";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";
import { clearPdfArtifacts, getPdfArtifact } from "./pdf-artifact";
import { clearPersonalStorage } from "@/libs/browser-storage";
const mocks = vi.hoisted(() => ({
	render: vi.fn<typeof createResumePdfBlob>(async () => new Blob(["synthetic-pdf"])),
}));
vi.mock("./pdf-document", () => ({ createResumePdfBlob: mocks.render }));
const snapshot = () => ({
	identity: { ownerId: "alice", resumeId: "cv", baseRevision: "v1", editGeneration: 1 },
	data: structuredClone(defaultResumeData),
});
beforeEach(() => {
	vi.stubGlobal("__PDF_BUILD__", { renderer: "forme-test", template: "template-source-hash", fonts: "manifest-hash" });
	clearPdfArtifacts();
	mocks.render.mockClear();
});
describe("selected PDF artifacts", () => {
	it("never returns the old PDF after an edit even when revision counters match", async () => {
		mocks.render.mockImplementationOnce(async (data) => new Blob([data.basics.name]));
		const input = snapshot();
		input.data.basics.name = "Before edit";
		const before = await getPdfArtifact(input);
		input.data.basics.name = "After edit";
		mocks.render.mockImplementationOnce(async (data) => new Blob([data.basics.name]));
		const after = await getPdfArtifact(input);
		expect(await before.blob.text()).toBe("Before edit");
		expect(await after.blob.text()).toBe("After edit");
		expect(after.inputHash).not.toBe(before.inputHash);
	});
	it("releases private artifacts on sign-out", async () => {
		await getPdfArtifact(snapshot());
		clearPersonalStorage();
		await getPdfArtifact(snapshot());
		expect(mocks.render).toHaveBeenCalledTimes(2);
	});
	it("reuses unchanged bytes across reopening and save acknowledgements with the current identity", async () => {
		const first = await getPdfArtifact(snapshot());
		const reopened = snapshot();
		reopened.identity.editGeneration = 0;
		reopened.identity.baseRevision = "saved-v2";
		const next = await getPdfArtifact(reopened);
		expect(next.blob).toBe(first.blob);
		expect(next.identity).toEqual(reopened.identity);
		expect(mocks.render).toHaveBeenCalledTimes(1);
	});
	it.each(["content", "template", "locale", "fonts"])("regenerates changed %s after reopening", async (change) => {
		const first = await getPdfArtifact(snapshot());
		const edited = snapshot();
		if (change === "content") edited.data.basics.name = "Edited name";
		if (change === "template") edited.data.metadata.template = "rhyhorn";
		if (change === "locale") edited.data.metadata.page.locale = "ar-SA";
		if (change === "fonts")
			vi.stubGlobal("__PDF_BUILD__", { renderer: "forme-test", template: "template-source-hash", fonts: "new-fonts" });
		const next = await getPdfArtifact(edited);
		expect(next.inputHash).not.toBe(first.inputHash);
		expect(mocks.render).toHaveBeenCalledTimes(2);
	});
	it("preserves no character loss when the renderer does not report any", async () => {
		const artifact = await getPdfArtifact(snapshot());
		expect(artifact.lostCharacters).toBeNull();
	});
	it.each([{ characters: [] }, { characters: ['"₹" (U+20B9)'] }])(
		"preserves reported character loss: $characters",
		async ({ characters }) => {
			mocks.render.mockImplementationOnce(async (_data, _onProgress, _options, extras) => {
				extras?.onLostCharacters?.(characters);
				return new Blob(["synthetic-pdf"]);
			});
			const artifact = await getPdfArtifact(snapshot());
			expect(artifact.lostCharacters).toEqual(characters);
			expect(artifact.lostCharacters).toBeTruthy();
		},
	);
	it("deduplicates bytes for preview/check/download and independently hashes the Blob", async () => {
		const input = snapshot();
		const [a, b] = await Promise.all([getPdfArtifact(input), getPdfArtifact(input)]);
		expect(a).toBe(b);
		expect(mocks.render).toHaveBeenCalledTimes(1);
		const hash = await crypto.subtle.digest("SHA-256", await a.blob.arrayBuffer());
		expect(a.bytesHash).toBe(Array.from(new Uint8Array(hash), (v) => v.toString(16).padStart(2, "0")).join(""));
	});
	it("isolates equal inputs by owner, generation and selected configuration", async () => {
		const a = await getPdfArtifact(snapshot());
		const next = snapshot();
		next.identity.ownerId = "bob";
		const b = await getPdfArtifact(next);
		expect(a).not.toBe(b);
		next.identity.editGeneration++;
		expect(await getPdfArtifact(next)).not.toBe(b);
		next.data.metadata.page.locale = "ar-SA";
		expect((await getPdfArtifact(next)).inputHash).not.toBe(b.inputHash);
	});
	it("captures input before asynchronous hashing and does not cache failures", async () => {
		const input = snapshot();
		const pending = getPdfArtifact(input);
		input.data.basics.name = "later";
		await pending;
		expect(mocks.render.mock.calls[0]?.[0].basics.name).toBe("");
		clearPdfArtifacts();
		mocks.render.mockRejectedValueOnce(new Error("font failed"));
		await expect(getPdfArtifact(snapshot())).rejects.toThrow("font failed");
		await expect(getPdfArtifact(snapshot())).resolves.toHaveProperty("bytesHash");
	});
	it("does not publish an aborted request", async () => {
		const signal = AbortSignal.abort();
		await expect(getPdfArtifact(snapshot(), { signal })).rejects.toThrow();
		expect(mocks.render).not.toHaveBeenCalled();
	});
});

it("rejects a render completed after its owner scope was cleared", async () => {
	let finish!: (blob: Blob) => void;
	mocks.render.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const pending = getPdfArtifact(snapshot());
	const rejected = expect(pending).rejects.toThrow("superseded");
	await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
	clearPdfArtifacts();
	finish(new Blob(["old-owner"]));
	await rejected;
});
