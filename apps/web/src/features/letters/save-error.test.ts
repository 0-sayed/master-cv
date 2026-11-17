// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { ORPCError } from "@orpc/client";
import { showLetterChangeFailure } from "./save-error";
import { getUiLocaleMessages } from "@/libs/locale";

const mocks = vi.hoisted(() => ({ add: vi.fn(), load: vi.fn(), get: vi.fn(), duplicate: vi.fn() }));
vi.mock("@reactive-resume/ui/components/toast", () => ({ toast: { add: mocks.add } }));
vi.mock("./store", () => ({
	useLetterEditorStore: { getState: () => ({ letter: { id: "letter" }, load: mocks.load }) },
}));
vi.mock("@/libs/orpc/client", () => ({ client: { coverLetters: { getById: mocks.get, duplicate: mocks.duplicate } } }));
vi.mock("@/libs/error-message", () => ({
	getOrpcErrorMessage: (_error: unknown, options: { fallback: string }) => options.fallback,
}));

beforeEach(() => {
	vi.clearAllMocks();
	i18n.load("en-US", {});
	i18n.activate("en-US");
});

it("names a failed cover-letter change and repeats the exact action on retry", () => {
	const retry = vi.fn();
	showLetterChangeFailure(new Error("offline"), retry);
	const toast = mocks.add.mock.calls[0]?.[0];
	expect(toast.title).toBe("Could not save the cover-letter change");
	expect(toast.actionProps.children).toBe("Try again");
	toast.actionProps.onClick();
	expect(retry).toHaveBeenCalledOnce();
});

it("explains a submitted-document rejection and offers a separate copy", () => {
	showLetterChangeFailure(new ORPCError("BAD_REQUEST", { data: { reason: "SUBMITTED_DOCUMENT_IMMUTABLE" } }));
	const toast = mocks.add.mock.calls[0]?.[0];
	expect(toast.description).toBe(
		"The submitted letter stays unchanged. Create a copy to open an unlinked, editable draft. You can link the draft to any application.",
	);
	expect(toast.actionProps.children).toBe("Create a copy");
});

it("translates every save-failure action in the Arabic interface", async () => {
	i18n.loadAndActivate(await getUiLocaleMessages("ar-SA"));
	for (const [error, label] of [
		[new ORPCError("BAD_REQUEST", { data: { reason: "SUBMITTED_DOCUMENT_IMMUTABLE" } }), "إنشاء نسخة"],
		[new ORPCError("CONFLICT"), "إعادة تحميل"],
		[new Error("offline"), "حاول مرة أخرى"],
	] as const) {
		showLetterChangeFailure(error, vi.fn());
		expect(mocks.add.mock.calls.at(-1)?.[0].actionProps.children).toBe(label);
	}
});

it("offers an explicit saved-version reload for a stale revision", async () => {
	mocks.get.mockResolvedValue({ id: "letter", revision: 2 });
	showLetterChangeFailure(new ORPCError("CONFLICT"));
	const toast = mocks.add.mock.calls[0]?.[0];
	expect(toast.actionProps.children).toBe("Reload");
	toast.actionProps.onClick();
	await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledWith({ id: "letter", revision: 2 }, true));
});

it("opens the editable copy directly from the submitted-letter recovery action", async () => {
	const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	mocks.duplicate.mockResolvedValue({ id: "draft-copy", sourceApplicationId: null, isLocked: false });
	try {
		showLetterChangeFailure(
			new ORPCError("BAD_REQUEST", { data: { reason: "SUBMITTED_DOCUMENT_IMMUTABLE" } }),
			undefined,
			"submitted-letter",
		);
		mocks.add.mock.calls[0]?.[0].actionProps.onClick();
		await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/builder/letter/draft-copy"));
		expect(mocks.duplicate).toHaveBeenCalledWith({ id: "submitted-letter", name: "Untitled letter (copy)" });
	} finally {
		assign.mockRestore();
	}
});

it.each(["copy", "reload"])("retries a failed %s recovery with its own message", async (action) => {
	mocks.duplicate.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: "copy" });
	mocks.get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: "letter" });
	const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	try {
		showLetterChangeFailure(
			action === "copy"
				? new ORPCError("BAD_REQUEST", { data: { reason: "SUBMITTED_DOCUMENT_IMMUTABLE" } })
				: new ORPCError("CONFLICT"),
		);
		mocks.add.mock.calls.at(-1)?.[0].actionProps.onClick();
		await vi.waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
		const failure = mocks.add.mock.calls.at(-1)?.[0];
		expect(failure.title).toBe(
			action === "copy" ? "Could not create a cover-letter copy" : "Could not reload the cover letter",
		);
		expect(failure.actionProps.children).toBe("Try again");
		failure.actionProps.onClick();
		await vi.waitFor(() => expect(action === "copy" ? assign : mocks.load).toHaveBeenCalled());
	} finally {
		assign.mockRestore();
	}
});
