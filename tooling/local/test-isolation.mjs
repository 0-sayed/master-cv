import { assertNoAiCredentials, installTestNetworkGuard } from "./test-ai-guard.mjs";

// Explicit opt-in for synthetic child builds, browser servers and offline evaluations.
// Preserve NODE_ENV: the browser exercises the production application runtime.
assertNoAiCredentials();
// Transitive server imports must use the explicitly supplied disposable integration database.
if (process.env.COVER_LETTER_TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.COVER_LETTER_TEST_DATABASE_URL;
else delete process.env.DATABASE_URL;
process.env.TEST_INFERENCE_ISOLATION = "true";
installTestNetworkGuard();
