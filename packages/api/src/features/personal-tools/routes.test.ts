import type { AnyProcedure } from "@orpc/server";
import { expect, it, vi } from "vite-plus/test";
import { call, isProcedure } from "@orpc/server";
import { applicationsRouter } from "../applications/router";
import { coverLettersRouter } from "../cover-letters/router";
import { documentsRouter } from "../documents/router";
import { withPersonalToolsPolicy } from "./availability";

const unavailable = <T>(work: () => T) =>
	withPersonalToolsPolicy(
		{
			coverLetters: { disposition: "enabled", releaseApproved: false },
			applications: { disposition: "enabled", releaseApproved: false },
		},
		work,
	);

vi.mock("../../context", async () => {
	const { os } = await vi.importActual<typeof import("@orpc/server")>("@orpc/server");
	return { protectedProcedure: os.$context<{ user: { id: string }; resHeaders: Headers }>() };
});

function procedures(router: Record<string, unknown>, prefix = ""): [string, AnyProcedure][] {
	return Object.entries(router).flatMap(([name, value]) =>
		isProcedure(value)
			? [[prefix + name, value] as [string, AnyProcedure]]
			: procedures(value as Record<string, unknown>, `${prefix}${name}.`),
	);
}

it.each([...procedures(coverLettersRouter, "letters."), ...procedures(applicationsRouter, "applications.")])(
	"denies retained procedure %s before side effects",
	async (_name, procedure) => {
		await expect(
			unavailable(() =>
				call(procedure, {}, { context: { user: { id: "synthetic-owner" }, resHeaders: new Headers() } }),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERSONAL_TOOL_UNAVAILABLE" });
	},
);

it.each(["rename", "setTags", "setLocked", "linkApplication", "trash", "restore", "purge"] as const)(
	"denies the document-library letter action %s",
	async (name) => {
		const input = {
			type: "letter",
			id: "synthetic-letter",
			name: "name",
			tags: [],
			isLocked: false,
			applicationId: null,
		};
		await expect(
			unavailable(() =>
				call(documentsRouter[name] as AnyProcedure, input, {
					context: { user: { id: "synthetic-owner" }, resHeaders: new Headers() },
				}),
			),
		).rejects.toMatchObject({ code: "FORBIDDEN", message: "PERSONAL_TOOL_UNAVAILABLE" });
	},
);
