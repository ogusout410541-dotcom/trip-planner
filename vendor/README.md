# 同梱している部品

配信元（CDN）の「最新版」を直接読むと、向こうが版を上げた日に何もしていないのに画面が壊れることがある。
また圏外では読み込めない。そのため版を固定してここに置いている。

| ファイル | 版 | 取得元 | ライセンス |
|---|---|---|---|
| `vue.global.prod.js` | Vue 3.5.43 | https://unpkg.com/vue@3.5.43/dist/vue.global.prod.js | MIT |
| `tailwindcss-play-3.4.17.js` | Tailwind CSS Play CDN 3.4.17 | https://cdn.tailwindcss.com/3.4.17 | MIT |
| `fontawesome/` | Font Awesome Free 6.5.1 | https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/ | アイコン CC BY 4.0／フォント SIL OFL 1.1／CSS MIT |

## 版を上げるとき

1. 上の URL の版番号を変えて取り直す（`sw.js` の `ASSETS` に載っているファイル名も合わせる）
2. `node tests/run.js` を全部通す
3. `sw.js` の `CACHE` と `index.html` の `APP_VERSION` を上げる（上げないとスマホに古い部品が残る）
