import { Redirect } from "expo-router";
import { routes } from "@/routes";

/** Standalone checking is gated; the shared API accepts only an owned current CV artifact. */
export default function AtsCheckerRoute() {
	return <Redirect href={routes.documents()} />;
}
