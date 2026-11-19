import configuration from "./writer-config.json";

/** Every configured writer task has a user-facing entry point, including import and follow-up questions. */
export const publicReviewFeatures = Object.keys(configuration) as (keyof typeof configuration)[];
