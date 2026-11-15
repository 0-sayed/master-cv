import { createFileRoute } from "@tanstack/react-router";
import { DeletionPage } from "@/features/settings/privacy/deletion-page";
export const Route = createFileRoute("/dashboard/settings/delete-account")({ component: DeletionPage });
