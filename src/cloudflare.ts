import { resolveMaintenanceGate, type SiteGateD1 } from "./gate.ts";

type FetchHandler = (
	request: Request,
	env: { DB?: SiteGateD1 },
	ctx: ExecutionContext,
) => Response | Promise<Response>;

type WorkerHandler = {
	fetch?: FetchHandler;
	[key: string]: unknown;
};

/**
 * Wrap an EmDash Cloudflare worker so maintenance mode is enforced
 * before any page HTML is generated.
 */
export function withSiteGate<T extends WorkerHandler>(handler: T): T {
	const baseFetch = handler.fetch;
	if (!baseFetch) return handler;

	return {
		...handler,
		async fetch(request: Request, env: { DB?: SiteGateD1 }, ctx: ExecutionContext) {
			const blocked = await resolveMaintenanceGate(request, env.DB);
			if (blocked) return blocked;
			return baseFetch(request, env, ctx);
		},
	} as T;
}
