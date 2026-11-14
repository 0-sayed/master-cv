// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const names = [
	"A long synthetic CV name that must truncate without losing its accessible name",
	"سيرة عربية",
	"Mixed CV سيرة",
	"Fourth CV",
	"Fifth CV",
];
vi.mock("@/libs/orpc/client", () => ({
	orpc: {
		career: {
			master: {
				read: {
					queryOptions: () => ({
						queryKey: ["master"],
						queryFn: async () => ({
							facts: [
								{
									id: "fact",
									structured: { section: "skills", entityId: "skill", field: "name", value: "TypeScript" },
								},
							],
							sections: [],
							links: names.map((name, index) => ({ factId: "fact", resumeId: `cv-${index}`, name })),
						}),
					}),
				},
			},
		},
	},
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		params,
		to: _to,
		...props
	}: {
		children: ReactNode;
		params: { resumeId: string };
		to: string;
	}) => (
		<a href={`/builder/${params.resumeId}`} {...props}>
			{children}
		</a>
	),
}));
vi.mock("../hooks", () => ({ useSessionDraft: () => ({ value: null, setValue: vi.fn() }) }));
vi.mock("./entry-dialog", () => ({ CareerEntryDialog: () => null, fieldLabel: (field: string) => field }));
import { CareerInformationPage } from "./page";

afterEach(cleanup);
it("separates CV links into named chips, limits three and expands the remainder", async () => {
	i18n.loadAndActivate({ locale: "en-US", messages: {} });
	render(
		<I18nProvider i18n={i18n}>
			<QueryClientProvider client={new QueryClient()}>
				<CareerInformationPage />
			</QueryClientProvider>
		</I18nProvider>,
	);
	const first = await screen.findByRole("link", { name: `Open CV ${names[0]}` });
	expect(first.getAttribute("title")).toBe(names[0]);
	expect(first.getAttribute("href")).toBe("/builder/cv-0");
	expect(first.getAttribute("data-slot")).toBe("fact-chip");
	expect(first.querySelector('bdi[dir="auto"]')?.classList.contains("truncate")).toBe(true);
	expect(first.querySelector('[data-slot="icon"]')).not.toBeNull();
	expect(screen.getByText("Used in", { exact: true })).toBeDefined();
	expect(screen.getAllByRole("link")).toHaveLength(3);
	const more = screen.getByRole("button", { name: "+2 more" });
	expect(more.getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(more);
	expect(screen.getAllByRole("link")).toHaveLength(5);
	expect(screen.queryByRole("button", { name: "+2 more" })).toBeNull();
});
