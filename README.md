# emdash-plugin-site-gate

EmDash 向けネイティブプラグイン。公開ページ全体に対して、管理画面から次を切り替えられます。

| モード | 挙動 | セキュリティ |
| --- | --- | --- |
| オフ | 通常表示 | — |
| パスワード | 閲覧用パスワード画面（フロント） | **簡易**（HTML/JS から回避可能） |
| メンテナンス | サーバーが 503 のみ返す | **高い**（サイト本文を返さない） |

## Cloudflare での必須配線（メンテを安全にする）

`src/worker.ts`:

```ts
import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { withSiteGate } from "emdash-plugin-site-gate/cloudflare";

export { PluginBridge };

export default withSiteGate({
  ...handler,
  scheduled: createScheduledHandler(),
});
```

これがないと、メンテナンスはフロントの重ね合わせだけになり突破できます。

## インストール

```bash
npm install github:molyinc/emdash-plugin-site-gate
```

`astro.config.mjs`:

```js
import { siteGatePlugin } from "emdash-plugin-site-gate";

emdash({
  plugins: [siteGatePlugin()],
});
```

レイアウトに `EmDashHead` / `EmDashBodyStart` / `EmDashBodyEnd` が必要です。

## 管理画面

1. `/_emdash/admin` → **Plugins** → **Site Gate**
2. 表示モード・パスワード・文言を設定

メンテナンス中も `/_emdash` は開けるので、管理者はモードを戻せます。
