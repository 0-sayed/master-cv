/** Provision a new restricted runtime login in an explicitly selected local synthetic database. */
export function provisionRuntimeRole(migrationUrl: string, role?: string): Promise<string>;
export function grantRuntimePrivileges(pool: import("pg").Pool, role: string): Promise<void>;
export function syncRuntimeRole(migrationUrl: string, role: string, password: string): Promise<void>;
