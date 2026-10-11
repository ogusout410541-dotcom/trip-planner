# 旅程プランナー — 開発メモ（Claude Code 用）

推し活遠征（ホロライブ）の旅程を **PC で組み → A4 に刷って持ち歩き → 当日はスマホで見る** ための個人ツール。
使う人は本人1人。基本は1人旅・鉄道と空港が中心なので、**乗換の作り込みがいちばん大事**。

進め方の決まり：まずレビュー・報告 → 本人が確認してから直す。コミットは区切りごと、`node tests/run.js` が通ったときだけ。

## 技術方針（変えるときは要相談）

- `index.html` 1枚（Vue 3 グローバルビルド＋Tailwind Play CDN）。ビルドなし。`file://` のダブルクリックでも、https の公開ページでも動く
- 部品は `vendor/` に**版を固定して同梱**（Vue 3.5.43 / Tailwind 3.4.17 / Font Awesome 6.5.1 / QR）。CDN の「最新」を読むと、向こうの更新で壊れる・圏外で開けない。上げ方は `vendor/README.md`
- Google Fonts（Noto Sans JP）だけは外から読む。圏外では端末の文字で描く
- データは端末の localStorage。PC（file://）とスマホ（公開URL）は置き場が別なので、受け渡しは「スマホで開く」のリンク
- UI 文言は日本語。コメントも日本語で、今のコード程度の密度。画面に絵文字は使わない（Font Awesome）

## ファイル構成

```
index.html              本体（CSS → 版と履歴 → setup() → return { 公開名 } → template）
vendor/                 同梱の部品（README に版と出どころ）
sw.js                   オフライン用（https のときだけ登録）。CACHE は APP_VERSION と同じ番号
manifest.webmanifest    ホーム画面に置くための情報
icons/                  アイコン（SVG が元。PNG は tests/out/_icons.js で作る）
tools/serve.js          ローカル確認用の配信（node tools/serve.js → http://127.0.0.1:7835/）
tests/                  検証一式（下の「テスト」）
_backup/                改修前の控え（git には入れない）
プレビュー/              過去の画面の控え（git には入れない）
```

## localStorage のキー

| キー | 中身 |
|---|---|
| `trip_index_v1` | 旅程の一覧（並び順＝表示順） |
| `trip_current_id_v1` | 開いている旅程の id |
| `trip_data_<id>` | 旅程1件の中身 |
| `trip_broken_<id>_<日時>` | 起動時に読めなかった旅程の退避先（設定の「バックアップと書き出し」から書き出せる） |
| `trip_draft_v1` | 編集中の書きかけ（0.5秒おき） |
| `trip_home_v1` | 自宅と最寄り駅（全旅程で共通） |
| `trip_print_opts_v1` | 印刷の設定 |
| `net_cache_v1` / `net_enabled_v1` | 駅・地図の問い合わせの控え（60日・1MBまで）／通信のオンオフ |
| `odpt_token_v1` | ODPT のトークン |
| `trip_seen_version_v1` | 最後に見た版（更新後に「新しくなったこと」を1回出す） |
| `trip_day_mode_v1` / `trip_day_ask_v1` | 当日モードで開くか（端末ごと）／「今日は旅程の日です」を聞いた日 |
| `trip_last_backup_v1` | 自動バックアップ（1日1回のファイル書き出し）をした日 |
| `dark_mode` | 明暗 |

## データモデル

- 旅程：`{ title, startDate, endDate, totalBudget, members, status:'wip'|'done', ignored:[], pins:{}, origin, destination, days:[] }`
- 日：`{ date, dayNumber, ignoreOverlap, events:[] }`
- 予定：`{ id, type, anchor:''|'start'|'end', title, startTime, endTime, location, cost, paid, seat, notes, url, crossOk, route:[], flightNo, direction }`
- 駅（`route[]` の1要素）：`{ name, arrPlatform, arrTime, depPlatform, depTime, line, dest, stations, kind, through, quick }`。**乗換は1つの駅の中で完結**（着ホーム→猶予→発ホーム→乗る列車）。`through`＝降りない直通、`quick`＝対面乗換
- 「役割」（出発地点/到着地点＝`anchor`）と「カテゴリ」（`type`）は**直交する二軸**
- 時刻は `HH:MM`。日またぎは「終了 < 開始」か `30:00` のような書き方

## 実装ルール（踏んだことのある落とし穴）

- **機能を足したら印刷側（`.print-only` と `@media print`）にも反映する**。印刷が主用途
- **`newEvent()` と `normalizeData()` の持ち物をそろえる**。片方だけに足すと、新規と読み込みで形が変わり往復で差分が出る
- **新しいカテゴリは `CATS`・`CAT_HINTS`・`TITLE_SUGGESTS` をそろえて足す**（無いと別カテゴリの例文が出る）
- **壊す操作はすべて取り消せること**（予定・日程・旅程の削除、受け取りでの置き換え、並べ替え、一括シフト）
- **元に戻す（`history`）は旅程ごと**。`_applyTrip` で必ず空にする（残すと、別の旅程の中身で今の旅程を上書きする。v1.1.0 で修正）
- **setup の中の `history` は「元に戻す」の ref**。ブラウザの履歴は `window.history` と書く
- `editing` は `ref`。setup 内の関数では `editing.value.route` と書く（テンプレートだけ自動で開く）
- モーダルは `data-modal="<key>"` で名指しし、`openModalKey`・Esc の連鎖・`anyModal()` に必ず足す。閉じるアニメ中は前のモーダルも DOM に残るので `[role=dialog]` で引かない
- `v-for` には必ず `:key`（`tests/template.js` が見張る）
- **同じ事実を2か所に持たない**。`state.startDate` と `days[].date` がずれた件がある。書き込み口は `setStartDate`/`setEndDate`/`setDayDate`
- 日付欄は打っている途中で `change` が空で飛ぶので `validDate()` を通らない値は捨てる。ホイールで数値欄が変わらないよう、入力中の欄は回されたら `blur()`
- 小さいアイコンボタンは 24px 以上（`w-6`）。ヘッダーにボタンを足すときは、390px と 1280px でタイトルが潰れないこと（`tests/boot.js` が 80px 以上を見張る）
- **知らせ（`flash`）は折り返す**。1行で切ると、スマホで長い文が読めない
- **カテゴリ色・地点の色を文字に使うときは `ink(色, 背景)` を通す**（色味を保ったまま 4.5:1 まで濃く／暗い背景なら明るく。背景を省くと今の明暗の面）。白い文字を乗せる下地は `ink(色, '#ffffff')`。紙に刷る部分は明暗に関係なく白地で
- 明るい画面の補足の灰色は `text-slate-400`→#5f6e84、`text-slate-500`→#536175 に寄せてある（CSS）。暗い画面の `body.dark .text-slate-*` は `!important` なので、インラインの色で上書きできない（クラスごと外す）
- 色を足したら `tests/screens.js`（10画面×3幅×明暗のコントラスト）を走らせる

## 文言の決まり（ライブログ・クルナビと共通）

- 何を・どこで・どうするかが省略なしで分かる自然な日本語。機械が報告するような言い方（「〜として使います」「〜すると〜に表示されます」）や、短い文を2つ並べる説明口調を避ける
- 表記：**選ぶ**（えらぶ ×）／**タイトル**（題名 ×）／その時点は**時刻**（時間 ×）／時間の**重なり**（重複 ×）／点検の段は**要修正・注意・気づき**／**乗り換える**（乗り継ぐ ×）。ラベルは名詞形（乗換）、文中は動詞形（乗り換え）／印刷の段数は「段」／金額は「（円）」／当日払うぶんは「当日」
- 開発者の言葉（トースト・エディタ・テキストエリア）を画面に出さない
- 紙面には説明・助言の文を入れない。説明は入力画面の側に置く
- `tests/wording.js` が上の禁止語を見張る。`node tests/_wording-extract.js` で画面の文言を全部抜き出せる

## 印刷（自前のページャ）

CSS の改ページ任せはやめた。`planPrint()`（async）が ①かたまり（日の見出し／予定ひとつ）の高さを段の幅で実測 → ②段へ順に詰める（見出しだけが段末に残らない／段をまたぐ日は「つづき」見出し）→ ③段が K 本たまったら次の紙、で `printPages = [{k, cols:[[blk…]]}]` を作る。

- 段数は自動で「いちばん紙が少なくなる K」、2枚以上なら1枚3〜4段（`MAX_AUTO_COLS=4`）。文字の縮小はしない
- 紙の高さはぴったりにするとブラウザが1枚送るので `PAGE_PAD_MM=4` を引き、`pageSafe()` で段数に応じた余裕を取る
- 段の仕切りは `::before`（padding/border は幅を食う）。`.ptl-blk { display: flow-root }`（マージンの相殺で低く測れる）
- **締めの行は「出力：日時」とページ番号が入った状態で測る**（空で測ると実際の印刷が1枚増えていた。v1.1.0 で修正）
- 中身や設定が変わると 500ms 後に組み直す（Ctrl+P でも正しい割り付け）。`beforeprint` でも組み直す

## 点検（`dayIssues`）

`{level:'error'|'warn'|'info', type, key, msg, ids, fix|how}` を返す。**指摘には必ず `fix`（直す案＋`detail`）か `how`（手で直す手引き）を付ける**（`tests/flow.js` が見張る）。`key` 単位で無視でき（`state.ignored`）、「重なりは気にしない」は `type:'overlap'` にだけ効く。

主な判定：乗換猶予（5分未満、対面は0分未満）／時刻の逆行／路線がその駅を通るか（`linesAt`）／駅数（`isFastKind`＝「普通・各停…でなければ通過あり」の引き算）／行先の向き／直通（`junctionOf`・`throughTo`）／移動の抜け（600m 未満は言わない）／つなぎ目の食い違い（`type:'chain'`）／距離と所要時間（位置が確かでないときは info に落とす＝`posConfident`）／出発日と Day1 の日付。

## 外のサービス

| 用途 | サービス | 注意 |
|---|---|---|
| 駅名→路線・駅の並び・座標 | HeartRails Express（無料・登録不要） | 路線は正式名（京浜急行本線…）なので `LINE_ALIASES` で名寄せ |
| 地名検索 | Nominatim（1秒に1回まで） | 同名の地名・停留所が各地にある。目印があれば `viewbox`＋`bounded` で近所だけ。「徳島空港」は正式名（徳島阿波おどり空港）で引く＝`PLACE_ALIASES` |
| 時刻表 | ODPT | トークン無しで都営が全部。**JR東日本と大手私鉄はチャレンジ限定ライセンス**で恒久利用は前提にできない |
| 所要時間の目安 | Valhalla → OSRM（車のみ）→ 直線×1.3 | 混むと無応答。サービスごとのサーキットブレーカ（`svcOk`/`svcMark`） |
| 徳島県のバス停 | 国土数値情報 P11-22（同梱 78KB） | OSM には徳島の停留所がほぼ無い |

## 当日モード（v1.1.0）

`dayTimeline(day)` が1日の予定を「その日の0時からの通しの分」に並べ（直前の時刻より6時間以上前に戻ったら翌日）、`dm`（computed）が見る日・いま・次・次の一手（`step`：次に着く駅／次に乗る列車）を決める。

- 見る日：いまが予定の範囲（前3時間〜後2時間）に入る日 → 今日の日付の日 → 次の日付の日
- 終わりが無い予定は次の予定の始まりまで（起床・就寝・チェックインなど `MOMENT_TYPES` は瞬間）
- 遅れは `shiftFrom()`（経路の時刻も一緒に動く・取り消せる）。画面を点けたままは Wake Lock（画面を切り替えたら掛け直す）
- 開いていたかは端末ごとに覚える。旅程の日に開くと1日1回だけ「当日モードにする」をすすめる
- 当日モード中の知らせは下の操作ボタンにかぶらないよう上へずらす

## スマホで開く（v1.1.0）

- `openShare()` が `{app:'trip', v:1, id, data}` を、空の欄・既定値を落としてから deflate-raw ＋ base64url にして `SITE_URL#trip=…` を作る（ハッシュなのでサーバーに送られない）。QR は `vendor/qr.js`（クルナビの自作部品、v40-L で約2.9KBまで）。3日分くらいの旅程はたいてい入りきらないので、リンクのコピー／共有で送る
- 受け取る側（`checkIncoming`、起動時と `hashchange`）：同じ id があれば「置き換える（取り消せる）／別の旅程として足す」。**初回は送り元と同じ id で入れる**（次に送ったとき同じ旅程と分かるように）。まっさらな端末の空の「新しい旅程」は片づける
- `SITE_URL` は公開先が決まったら合わせる（https で開いているときは自分の URL を使う）

## クラウドに保存（v1.2.0、GAS）

Cookie の削除で旅程が全部消えた（本人が実際に経験）ことへの対策。GAS 側は `gas/コード.gs`、準備の手順は `gas/デプロイ手順.md`。クルナビの同期と同じ作り。

- 設定は `trip_cloud_v1`（url・phrase・最後にそろえたサーバーの時刻 updated）、合成の起点は `trip_cloud_base_v1`
- 合言葉は送らず `SHA-256('trip:'+合言葉)` の先頭16バイト（32桁）を置き場の鍵にする。確認コードはその先頭4桁
- 送るのは `{v, order, trips:{id: 旅程}, home}` を deflate-raw で縮めたもの（`packJson`）。**slim はしない**（空欄を落とすと base との比較で差分だらけになる）
- `cloudSync()`：受け取る → `merge3(base, この端末, サーバー)` → 変わっていれば入れる → サーバーと違えば送る（`base` に updated を添え、競合なら最大3回やり直す）
- **初めてつなぐ端末（base が無い）**：サーバーが空なら送る／この端末が空なら取り込む（**空の端末は送らない**）／両方にあれば「合わせる・クラウドにする・この端末で上書き」を選ばせる
- 直したら 4秒後、画面に戻ってきたら（15秒以上あいていれば）、`online` で同期。編集画面を開いている間は読み直さない。取り込んだ直後 0.4秒は自分の編集として数えない
- 旅程がひとつも無く、つないでもいないときは、本文の上に「前に作った旅程を戻せます」（クラウド／ファイル）
- ヘッダーの雲の印：緑＝保存済み、橙＝圏外、赤「未保存」＝エラー
- `CLOUD_URL_DEFAULT` に自分の GAS の URL を入れておくと、Cookie を消したあとも合言葉だけで戻せる
- 設定をスマホへは `#cloud=`（合言葉が入るので人に見せない）。ホーム画面のアプリと Safari は保存場所が別なので、アプリ側では URL と合言葉を入れる
- 検査は `tests/cloud.js`（端末ごとに `browser.createBrowserContext()` で localStorage を分ける。**同じ文脈のタブは localStorage を共有する**）と `tests/gas.js`（本物の コード.gs を `tests/_gas_fake.js` の偽サービスで動かす）

## オフライン・版の更新

- `sw.js` は https のときだけ登録（localhost では外す。検査は `trip_sw_force_v1=1` で強制）
- install は `cache:'reload'` ＋ `?v=CACHE` で取って元の URL で入れる（GitHub Pages の max-age=600 で古いファイルを掴むのを防ぐ）。本体は裏で1つずつ更新しない（新旧が混ざる）
- **リリースのたびに `APP_VERSION`（index.html）・`CACHE`（sw.js）を同じ番号に上げ、`CHANGELOG` の先頭に1件足す**（tag: new / up / fix、使う人の言葉で）。`tests/version.js` がずれを見張る
- 新しい版を取り込んでも勝手に読み込み直さない（知らせの「読み込み直す」で本人が切り替える）

## 公開（GitHub Pages）

- 公開URL：https://ogusout410541-dotcom.github.io/trip-planner/（リポジトリ `ogusout410541-dotcom/trip-planner`、main の / を配信。2026-10-12 公開）
- 手順：版を上げる（APP_VERSION・sw.js の CACHE・CHANGELOG）→ `node tests/run.js` → コミット → `git push`
  → `https://…/trip-planner/sw.js` の CACHE が新しい版になるまで待つ → `node tests/_live.js` で本番を確かめる（版・SW の一式・圏外・リンクの受け取り）
- push は外に出る操作なので、本人の指示を受けてから

## テスト

`cd tests && npm install`（初回だけ）→ `node tests/run.js`（全部、約2分）／`node tests/run.js print flow`（一部）。Chrome は `C:\Program Files\Google\Chrome\Application\chrome.exe`。外部の通信は既定で止めている（結果が日によって変わらないように）。

| ファイル | 見ているもの |
|---|---|
| `template.js` | テンプレートの構文、使っている名前がすべて公開されているか（`prefixIdentifiers:true` で洗う）、`v-for` の `:key` |
| `boot.js` | 空・サンプル × 3幅 × 明暗で、エラー・はみ出し・ヘッダーのタイトル幅 |
| `flow.js` | 追加・編集・削除・元に戻す・書きかけの確認・再読込・旅程の切り替え／複製、点検が全日で走り、指摘に直し方がある |
| `print.js` | 4種の旅程 × 縦横で、見積りの枚数＝実際に PDF にした枚数、白紙なし |
| `storage.js` | 壊れた localStorage（途中で切れた JSON・null・一覧の破損…）でも起動でき、ほかの旅程を失わない |
| `daymode.js` | 時計を止めて「いま・次・乗換」の選び方10通り、遅れの反映と取り消し、端末ごとの記憶 |
| `share.js` | リンクでの往復（経路・直通・支払い済まで欠けない）、置き換えと取り消し、壊れたリンク |
| `offline.js` | SW を入れて圏外で開き直しても、画面・アイコン・見た目・当日モードが動く |
| `screens.js` | 主な10画面 × 3幅 × 明暗のはみ出しと、文字と背景のコントラスト（ふつうの字 4.5・大きい字 3.0。グラデ・すりガラス・わざと薄くしたものは除く） |
| `version.js` | 版＝履歴の先頭＝sw.js の CACHE、更新後に1回だけ「新しくなったこと」 |
| `wording.js` | 文言の禁止語・表記のゆれ・絵文字 |

検証用の旅程：`tests/fixtures/sample-fes.json`（架空の遠征）、`tests/fixtures/gen.js` の `bigTrip(日数, 件数)`。
テストから setup の中身は `app(page, A => …)`（本番版 Vue なので `#app._vnode.component.setupState` からたどる）。

## 既知の課題・次の候補

- スマホ幅ではヘッダーから「バックアップと書き出し」「明暗の切り替え」を外し、設定から開く形にした
- 実機（iPhone）で、ホーム画面に追加・機内モードで開く・当日モードで画面が消えないこと、はまだ確かめていない
