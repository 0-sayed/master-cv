import { createFileRoute, redirect } from "@tanstack/react-router";
import { VerifyEmailPage } from "@/features/auth/pages/verify-email";
import { verificationSearchSchema } from "@/features/auth/redirect";

export const Route = createFileRoute("/auth/verify-email")({
	validateSearch: verificationSearchSchema,
	beforeLoad: ({ context, search }) => {
		if (context.flags.disableEmailAuth) throw redirect({ to: "/auth/login", replace: true });
		if (search.done && !search.error)
			throw redirect({ to: "/auth/login", search: { callbackURL: search.callbackURL }, replace: true });
	},
	component: VerifyEmailPage,
});
