import type { CoverLetter } from "@reactive-resume/schema/cover-letter/data";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ORPCError } from "@orpc/client";
import { copyCoverLetterStyle } from "@reactive-resume/resume/cover-letter";
import { defaultResumeData } from "@reactive-resume/schema/resume/default";

const mocks = vi.hoisted(() => ({ update: vi.fn(), draft: vi.fn() }));
vi.mock("@/libs/orpc/client", () => ({
	client: { coverLetters: { update: mocks.update } },
	streamClient: { coverLetters: { draft: mocks.draft } },
}));

const { discardLetterDraft, startLetterDraft, useLetterEditorStore } = await import("./store");

const letter: CoverLetter = {
	id: "letter",
	name: "Letter",
	recipient: "",
	content: "<p>Mine</p>",
	greeting: null,
	signOff: null,
	style: copyCoverLetterStyle(defaultResumeData),
	layout: "structured",
	recipientName: "",
	recipientCompany: "",
	letterDate: null,
	sourceResumeId: "resume",
	sourceApplicationId: null,
	senderLinked: true,
	designLinked: true,
	isLocked: false,
	revision: 1,
	createdAt: new Date(),
	updatedAt: new Date(),
};

const store = () => useLetterEditorStore.getState();

function deferred<T>() {
	let resolve: (value: T) => void = vi.fn();
	let reject: (error: unknown) => void = vi.fn();
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function* chunks(...parts: string[]) {
	yield* parts;
}

beforeEach(() => {
	vi.resetAllMocks();
	store().reset();
	store().load(letter);
});

describe("saving", () => {
	it.each(["success", "failure"])("ignores an old session's %s while another letter is edited", async (result) => {
		const request = deferred<CoverLetter>();
		mocks.update.mockReturnValueOnce(request.promise).mockImplementation(async (input) => ({
			...letter,
			...input,
			revision: 2,
		}));
		store().edit({ content: "<p>A's edit</p>" });
		const saving = store().flush();
		store().load({ ...letter, id: "B" });
		store().edit({ content: "<p>B's edit</p>" });
		if (result === "success") request.resolve({ ...letter, content: "<p>A's edit</p>", revision: 2 });
		else request.reject(new ORPCError("CONFLICT"));
		await saving;
		expect(store().letter).toMatchObject({ id: "B", content: "<p>B's edit</p>" });
		expect(store().pending).toEqual({ content: "<p>B's edit</p>" });
		expect(store().status).toBe("saving");
		await store().flush();
		expect(mocks.update.mock.calls.map(([input]) => input.id)).toEqual(["letter", "B"]);
	});

	it("reports failed saves, retains the draft, and prevents a destructive change", async () => {
		mocks.update.mockRejectedValue(new Error("offline"));
		store().edit({ content: "<p>Unsaved</p>" });
		expect(await store().flush()).toBe(false);
		const restore = vi.fn();
		await expect(store().change(restore)).rejects.toThrow();
		expect(restore).not.toHaveBeenCalled();
		expect(store().letter?.content).toBe("<p>Unsaved</p>");
		expect(store().pending).toEqual({ content: "<p>Unsaved</p>" });
	});

	it("ignores a response after the same letter is reopened", async () => {
		const request = deferred<CoverLetter>();
		mocks.update.mockReturnValue(request.promise);
		store().edit({ content: "<p>Old visit</p>" });
		const saving = store().flush();
		store().reset();
		store().load(letter);
		request.resolve({ ...letter, content: "<p>Old visit</p>", revision: 2 });
		await saving;
		expect(store().letter).toEqual(letter);
	});

	it("keeps what was typed while the server's copy comes back trimmed, and bumps the revision", async () => {
		mocks.update.mockImplementation(async (input: { recipientName: string }) => ({
			...letter,
			recipientName: input.recipientName.trim(),
			revision: 2,
		}));
		store().edit({ recipientName: "Dana " });
		await store().flush();
		expect(mocks.update).toHaveBeenCalledWith(
			expect.objectContaining({ id: "letter", expectedRevision: 1, recipientName: "Dana " }),
		);
		expect(store().letter).toMatchObject({ recipientName: "Dana ", revision: 2 });
		expect(store().status).toBe("saved");
	});

	it("shows the letter's own design at once, ends the design link, and saves the design with what's typed", async () => {
		const { design, typography } = letter.style.metadata;
		mocks.update.mockImplementation(async () => ({ ...letter, designLinked: false, revision: 2 }));
		store().edit({ metadata: { design: { ...design, colors: { ...design.colors, primary: "rgba(1, 2, 3, 1)" } } } });
		store().edit({ metadata: { typography: { ...typography, body: { ...typography.body, fontSize: 12 } } } });
		store().edit({ content: "<p>Typed</p>" });

		expect(store().letter).toMatchObject({
			designLinked: false,
			content: "<p>Typed</p>",
			style: {
				metadata: { design: { colors: { primary: "rgba(1, 2, 3, 1)" } }, typography: { body: { fontSize: 12 } } },
			},
		});
		expect(store().letter).not.toHaveProperty("metadata");

		await store().flush();
		expect(mocks.update).toHaveBeenCalledTimes(1);
		expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({
			content: "<p>Typed</p>",
			metadata: { design: { colors: { primary: "rgba(1, 2, 3, 1)" } }, typography: { body: { fontSize: 12 } } },
		});
		// The server's copy comes back with the old design; what was set stays on top of it.
		expect(store().letter?.style.metadata.typography.body.fontSize).toBe(12);
	});

	it("stops saving after a conflict and keeps the edits", async () => {
		mocks.update.mockRejectedValue(new ORPCError("CONFLICT"));
		store().edit({ content: "<p>Changed</p>" });
		await store().flush();
		expect(store().status).toBe("conflict");
		expect(store().pending).toEqual({ content: "<p>Changed</p>" });
		store().edit({ content: "<p>More</p>" });
		await store().flush();
		expect(mocks.update).toHaveBeenCalledTimes(1);
	});
});

describe("drafts", () => {
	it("streams a draft beside the body, which only changes when the draft is kept", async () => {
		mocks.draft.mockResolvedValue(chunks("I'm applying", " for the role."));
		await startLetterDraft();
		expect(mocks.draft).toHaveBeenCalledWith({ id: "letter", variant: "draft" }, expect.anything());
		expect(store().draft).toEqual({ phase: "ready", text: "I'm applying for the role." });
		expect(store().letter?.content).toBe("<p>Mine</p>");

		discardLetterDraft();
		expect(store().draft).toEqual({ phase: "idle" });
		expect(store().letter?.content).toBe("<p>Mine</p>");
	});
});

it("keeps unsaved manual edits when the same document reloads after a save failure", async () => {
	mocks.update.mockRejectedValue(new Error("offline"));
	store().edit({ content: "<p>Keep my manual edit.</p>" });
	await store().flush();
	store().load(letter);
	expect(store().letter?.content).toBe("<p>Keep my manual edit.</p>");
	expect(store().status).toBe("error");
	expect(store().pending.content).toBe("<p>Keep my manual edit.</p>");
	mocks.update.mockImplementation(async (input) => ({ ...letter, content: input.content, revision: 2 }));
	expect(await store().flush()).toBe(true);
	expect(store().letter?.content).toBe("<p>Keep my manual edit.</p>");
});

it("marks action conflicts and accepts an explicit reload of the saved revision", async () => {
	const action = vi.fn().mockRejectedValue(new ORPCError("CONFLICT"));
	await expect(store().change(action)).rejects.toMatchObject({ code: "CONFLICT" });
	expect(store().status).toBe("conflict");
	store().load({ ...letter, revision: 2 });
	expect(store().status).toBe("conflict");
	store().load({ ...letter, revision: 2 }, true);
	expect(store().status).toBe("saved");
	expect(store().letter?.revision).toBe(2);
	expect(store().pending).toEqual({});
});

it("preserves a pending save conflict when a metadata change is requested", async () => {
	mocks.update.mockRejectedValue(new ORPCError("CONFLICT"));
	store().edit({ content: "<p>Keep this draft</p>" });
	const action = vi.fn();
	await expect(store().change(action)).rejects.toMatchObject({ code: "CONFLICT" });
	expect(action).not.toHaveBeenCalled();
	expect(store().pending.content).toBe("<p>Keep this draft</p>");
});
