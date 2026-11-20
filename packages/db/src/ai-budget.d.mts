export type AiBudgetRoute = {
	routeId: string;
	routeRevision: string;
	requestCapMicros: number;
	dayCapMicros: number;
	concurrency: number;
};

export function ensureAiBudget(migrationUrl: string, route: AiBudgetRoute, days?: number): Promise<number>;
