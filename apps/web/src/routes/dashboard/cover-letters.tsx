import { createFileRoute, redirect } from "@tanstack/react-router";
import { isPersonalToolAvailable } from "@/features/personal-tools/availability";

// The cover-letter library is now the Letters tab in Documents (6.0). This stub keeps old links working (Q2).
export const Route = createFileRoute("/dashboard/cover-letters")({
	beforeLoad: ({ context }) => {
		if (!isPersonalToolAvailable(context.flags.personalToolsAvailability, "coverLetters"))
			throw redirect({ to: "/dashboard", replace: true });
		throw redirect({ to: "/dashboard", search: { type: "letter" }, replace: true });
	},
});
