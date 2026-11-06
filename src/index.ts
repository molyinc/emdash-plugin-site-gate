import { definePlugin, type PluginDescriptor } from "emdash";
import { escapeHtml, PLUGIN_ID, type SiteGateMode } from "./gate.ts";

export type { SiteGateMode } from "./gate.ts";
export { withSiteGate } from "./cloudflare.ts";
export {
	maintenanceDocument,
	maintenanceResponse,
	resolveMaintenanceGate,
} from "./gate.ts";

export interface SiteGatePluginOptions {
	/** Optional default mode before admin settings exist */
	defaultMode?: SiteGateMode;
}

const PLUGIN_VERSION = "0.2.0";
const STORAGE_KEY = "emdash_site_gate_unlocked";

export function siteGatePlugin(
	options: SiteGatePluginOptions = {},
): PluginDescriptor<SiteGatePluginOptions> {
	return {
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		format: "native",
		entrypoint: "emdash-plugin-site-gate",
		options,
	};
}

async function sha256Hex(value: string): Promise<string> {
	const data = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function shell(inner: string): string {
	return `<div id="emdash-site-gate" style="position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:#070706;color:#f4efe4;font-family:system-ui,-apple-system,sans-serif;padding:24px">${inner}</div>`;
}

function softMaintenanceHtml(title: string, message: string): string {
	return shell(`<div style="width:min(420px,100%);display:grid;gap:14px;text-align:center">
  <p style="margin:0;letter-spacing:.18em;font-size:12px;opacity:.7">SITE NOTICE</p>
  <h1 style="margin:0;font-size:28px;font-weight:600">${escapeHtml(title)}</h1>
  <p style="margin:0;opacity:.8;font-size:15px;line-height:1.7;white-space:pre-wrap">${escapeHtml(message)}</p>
</div>`);
}

function passwordHtml(title: string, message: string): string {
	return shell(`<form id="emdash-site-gate-form" style="width:min(360px,100%);display:grid;gap:14px">
  <p style="margin:0;letter-spacing:.18em;font-size:12px;opacity:.7">PROTECTED</p>
  <h1 style="margin:0;font-size:28px;font-weight:600">${escapeHtml(title)}</h1>
  <p style="margin:0;opacity:.75;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(message)}</p>
  <input id="emdash-site-gate-input" type="password" name="password" autocomplete="current-password" required placeholder="Password" style="box-sizing:border-box;width:100%;padding:12px 14px;border:1px solid rgba(244,239,228,.25);border-radius:8px;background:#10100e;color:inherit;font-size:16px" />
  <p id="emdash-site-gate-error" hidden style="margin:0;color:#e07a7a;font-size:13px">パスワードが違います</p>
  <button type="submit" style="padding:12px 16px;border:0;border-radius:8px;background:#e0a322;color:#070706;font-weight:700;cursor:pointer">入る</button>
</form>`);
}

function passwordScript(hash: string): string {
	return `(() => {
  const hash = ${JSON.stringify(hash)};
  const key = ${JSON.stringify(STORAGE_KEY)};
  const gate = document.getElementById("emdash-site-gate");
  const form = document.getElementById("emdash-site-gate-form");
  const input = document.getElementById("emdash-site-gate-input");
  const error = document.getElementById("emdash-site-gate-error");
  if (!gate || !form || !input || !error) return;

  const unlock = () => {
    gate.remove();
    document.documentElement.style.overflow = "";
  };

  const lock = () => {
    document.documentElement.style.overflow = "hidden";
    input.focus();
  };

  async function digest(value) {
    const data = new TextEncoder().encode(value);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  if (sessionStorage.getItem(key) === hash) {
    unlock();
    return;
  }

  lock();
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const next = await digest(input.value);
    if (next !== hash) {
      error.hidden = false;
      input.select();
      return;
    }
    sessionStorage.setItem(key, hash);
    unlock();
  });
})();`;
}

function softLockScript(): string {
	return `document.documentElement.style.overflow = "hidden";`;
}

export function createPlugin(options: SiteGatePluginOptions = {}) {
	const defaultMode: SiteGateMode = options.defaultMode ?? "off";

	return definePlugin({
		id: PLUGIN_ID,
		version: PLUGIN_VERSION,
		capabilities: ["hooks.page-fragments:register"],
		admin: {
			settingsSchema: {
				mode: {
					type: "select",
					label: "表示モード",
					description:
						"公開ページのゲート。管理画面 (/_emdash) は常に利用可。メンテナンスは Worker 連携時にサーバー側で本文を遮断します。パスワードはフロント側の簡易ロックです。",
					options: [
						{ value: "off", label: "オフ（通常表示）" },
						{ value: "password", label: "パスワードロック（簡易）" },
						{ value: "maintenance", label: "メンテナンス中（サーバー遮断）" },
					],
					default: defaultMode,
				},
				password: {
					type: "secret",
					label: "閲覧パスワード",
					description: "パスワードロック時のみ使用。暗号化して保存されます。",
				},
				passwordTitle: {
					type: "string",
					label: "パスワード画面のタイトル",
					default: "閲覧パスワード",
				},
				passwordMessage: {
					type: "string",
					label: "パスワード画面の説明",
					multiline: true,
					default: "公開前のため、パスワードを入力してください。",
				},
				maintenanceTitle: {
					type: "string",
					label: "メンテナンス画面のタイトル",
					default: "メンテナンス中",
				},
				maintenanceMessage: {
					type: "string",
					label: "メンテナンス画面の説明",
					multiline: true,
					default: "ただいま準備中です。しばらくしてから再度アクセスしてください。",
				},
			},
		},
		hooks: {
			"page:fragments": async (event, ctx) => {
				if (event.page.path.startsWith("/_emdash")) return null;

				const mode =
					(await ctx.settings.get<SiteGateMode>("mode")) ?? defaultMode;
				if (mode === "off") return null;

				// Maintenance is enforced in the Cloudflare Worker (no site HTML).
				// Soft overlay remains only as a fallback for non-Worker local preview.
				if (mode === "maintenance") {
					const title =
						(await ctx.settings.get<string>("maintenanceTitle")) ??
						"メンテナンス中";
					const message =
						(await ctx.settings.get<string>("maintenanceMessage")) ??
						"ただいま準備中です。しばらくしてから再度アクセスしてください。";
					return [
						{
							kind: "html",
							placement: "body:start",
							html: softMaintenanceHtml(title, message),
							key: "site-gate-ui",
						},
						{
							kind: "inline-script",
							placement: "body:end",
							code: softLockScript(),
							key: "site-gate-script",
						},
					];
				}

				const password = (await ctx.settings.get<string>("password"))?.trim();
				if (!password) {
					return [
						{
							kind: "html",
							placement: "body:start",
							html: softMaintenanceHtml(
								"パスワード未設定",
								"管理画面の Plugins → Site Gate で閲覧パスワードを設定してください。",
							),
							key: "site-gate-ui",
						},
						{
							kind: "inline-script",
							placement: "body:end",
							code: softLockScript(),
							key: "site-gate-script",
						},
					];
				}

				const title =
					(await ctx.settings.get<string>("passwordTitle")) ?? "閲覧パスワード";
				const message =
					(await ctx.settings.get<string>("passwordMessage")) ??
					"公開前のため、パスワードを入力してください。";
				const hash = await sha256Hex(password);

				return [
					{
						kind: "html",
						placement: "body:start",
						html: passwordHtml(title, message),
						key: "site-gate-ui",
					},
					{
						kind: "inline-script",
						placement: "body:end",
						code: passwordScript(hash),
						key: "site-gate-script",
					},
				];
			},
		},
	});
}

export default createPlugin;
