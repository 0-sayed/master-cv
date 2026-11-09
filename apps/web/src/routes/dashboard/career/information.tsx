import { createFileRoute } from "@tanstack/react-router";
import { CareerInformationPage } from "@/features/career/information/page";
export const Route = createFileRoute("/dashboard/career/information")({ component: CareerInformationPage });
