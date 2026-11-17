import { env } from "@reactive-resume/env/server";
import { isFeatureAvailable } from "@reactive-resume/schema/personal-tools";

export const isCareerSchedulingEnabled = () =>
	isFeatureAvailable("careerAutomation") && (env.CLOUDFLARE || process.env.VERCEL !== "1" || Boolean(env.CRON_SECRET));
