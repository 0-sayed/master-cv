import type { DocumentsSearch } from "@/features/documents/documents-page";
import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import z from "zod";
import { DocumentsPage } from "@/features/documents/documents-page";
import { client } from "@/libs/orpc/client";

const defaults = { type: "all", q: "", tags: [], public: false, sort: "edited" } satisfies DocumentsSearch;

export const Route = createFileRoute("/dashboard/")({
	validateSearch: z.object({
		type: z.enum(["all", "resume", "letter"]).default("all").catch("all"),
		q: z.string().default("").catch(""),
		tags: z.array(z.string()).default([]).catch([]),
		public: z.boolean().default(false).catch(false),
		sort: z.enum(["edited", "name", "created"]).default("edited").catch("edited"),
		// Without one, the page uses the last view picked on this device.
		view: z.enum(["grid", "list"]).optional().catch(undefined),
		// Older links opened letters here; they open in the letter editor now.
		letter: z.string().optional().catch(undefined),
	}),
	search: { middlewares: [stripSearchParams(defaults)] },
	beforeLoad: async ({ search, context, location }) => {
		if (search.letter) {
			throw redirect({ to: "/builder/letter/$coverLetterId", params: { coverLetterId: search.letter }, replace: true });
		}
		const intent = new URLSearchParams(location.searchStr);
		intent.delete("locale");
		if (context.session?.user.emailVerified && intent.size === 0 && !location.hash) {
			const workspace = await client.career.personalWorkspace.state({});
			if (!workspace.welcomeCompletedAt) throw redirect({ to: "/dashboard/welcome", replace: true });
		}
	},
	component: RouteComponent,
});

function RouteComponent() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<DocumentsPage
			search={search}
			onSearchChange={(patch) =>
				void navigate({
					resetScroll: false,
					search: (previous: DocumentsSearch) => ({ ...previous, ...patch }),
					replace: true,
				})
			}
		/>
	);
}
