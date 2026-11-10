import { createFileRoute } from "@tanstack/react-router";
import { WelcomePage } from "@/features/career/welcome";
export const Route = createFileRoute("/dashboard/welcome")({ component: WelcomePage });
