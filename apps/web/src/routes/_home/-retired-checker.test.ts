import { expect, it } from "vite-plus/test";
import { Route } from "./ats-checker";

it.each([null, { user: { id: "synthetic-account" } }])(
	"sends retired checker navigation to the protected Review guide with session %j",
	(session) => {
		for (const locale of [undefined, "ar-SA", "en-US"]) {
			let redirected: unknown;
			try {
				Route.options.beforeLoad?.({ context: { session }, search: { locale } } as never);
			} catch (error) {
				redirected = error;
			}
			expect(redirected).toMatchObject({
				options: {
					to: "/dashboard/review-guide",
					search: locale ? { locale } : {},
					replace: true,
					statusCode: 308,
				},
			});
		}
	},
);
