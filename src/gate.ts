export type SiteGateMode = "off" | "password" | "maintenance";

export const PLUGIN_ID = "plugin-site-gate";
export const MODE_OPTION = `plugin:${PLUGIN_ID}:settings:mode`;
export const MAINTENANCE_TITLE_OPTION = `plugin:${PLUGIN_ID}:settings:maintenanceTitle`;
export const MAINTENANCE_MESSAGE_OPTION = `plugin:${PLUGIN_ID}:settings:maintenanceMessage`;

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function isEmDashAdminPath(pathname: string): boolean {
	return pathname === "/_emdash" || pathname.startsWith("/_emdash/");
}

export function parseOptionJson<T>(raw: string | null | undefined): T | null {
	if (raw == null || raw === "") return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

export function maintenanceDocument(title: string, message: string): string {
	const safeTitle = escapeHtml(title);
	const safeMessage = escapeHtml(message);
	return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100svh; display: grid; place-items: center;
      background: #070706; color: #f4efe4;
      font-family: system-ui, -apple-system, sans-serif; padding: 24px;
    }
    main { width: min(420px, 100%); text-align: center; display: grid; gap: 14px; }
    .eyebrow { margin: 0; letter-spacing: .18em; font-size: 12px; opacity: .7; }
    h1 { margin: 0; font-size: 28px; font-weight: 600; }
    p { margin: 0; opacity: .8; font-size: 15px; line-height: 1.7; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">MAINTENANCE</p>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </main>
</body>
</html>`;
}

export function maintenanceResponse(
	title = "メンテナンス中",
	message = "ただいま準備中です。しばらくしてから再度アクセスしてください。",
): Response {
	return new Response(maintenanceDocument(title, message), {
		status: 503,
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store, no-cache, must-revalidate",
			"Retry-After": "3600",
			"X-Robots-Tag": "noindex, nofollow",
		},
	});
}

export type SiteGateD1 = {
	prepare(query: string): {
		bind(...values: unknown[]): {
			first<T = Record<string, unknown>>(): Promise<T | null>;
		};
	};
};

async function readOption(db: SiteGateD1, name: string): Promise<string | null> {
	const row = await db
		.prepare("SELECT value FROM options WHERE name = ?")
		.bind(name)
		.first<{ value: string }>();
	return row?.value ?? null;
}

/**
 * Server-side maintenance gate for Cloudflare Workers.
 * Returns a 503 Response with no site HTML when mode is maintenance.
 * Always allows `/_emdash` so admins can turn the gate off.
 */
export async function resolveMaintenanceGate(
	request: Request,
	db: SiteGateD1 | undefined,
): Promise<Response | null> {
	if (!db) return null;

	const { pathname } = new URL(request.url);
	if (isEmDashAdminPath(pathname)) return null;

	const mode = parseOptionJson<SiteGateMode>(await readOption(db, MODE_OPTION));
	if (mode !== "maintenance") return null;

	const title =
		parseOptionJson<string>(await readOption(db, MAINTENANCE_TITLE_OPTION)) ??
		"メンテナンス中";
	const message =
		parseOptionJson<string>(await readOption(db, MAINTENANCE_MESSAGE_OPTION)) ??
		"ただいま準備中です。しばらくしてから再度アクセスしてください。";

	return maintenanceResponse(title, message);
}
