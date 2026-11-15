import { createFileRoute } from "@tanstack/react-router";
import { PrivacyPage } from "@/features/settings/privacy/page";
export const Route = createFileRoute("/dashboard/settings/privacy")({ component: PrivacyPage });
