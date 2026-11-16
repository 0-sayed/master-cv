import { z } from "zod";
export const legalSearchSchema = z.object({ tab: z.enum(["privacy", "terms"]).catch("privacy").default("privacy") });
export type LegalTab = z.infer<typeof legalSearchSchema>["tab"];
