export function assertNoAiCredentials(environment?: Record<string, string | undefined>): void;
export function testViteEnvironment<T>(
	directory: T,
	environment?: Record<string, string | undefined>,
	mode?: string,
): T | false;
export function installTestNetworkGuard(): void;
