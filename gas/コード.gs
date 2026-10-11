/**
 * 旅程プランナー クラウド保存用の Web アプリ（Google Apps Script）
 *
 * やること：合言葉ごとに JSON をひとつ、自分の Google ドライブの「旅程プランナー」フォルダに置いて読み書きする。
 * アプリからは合言葉そのものではなく、そのハッシュ（k）だけが飛んでくる。
 * 1日1つ、過去の版を残す（30日分）。まちがって上書きしても、ドライブのファイルから戻せる。
 *
 * 置き方（gas/デプロイ手順.md にも同じことを書いてある）
 *   1. https://script.google.com/ で「新しいプロジェクト」
 *   2. このファイルの中身を貼り付けて保存
 *   3. 右上「デプロイ」→「新しいデプロイ」→ 種類は「ウェブアプリ」
 *        次のユーザーとして実行：自分
 *        アクセスできるユーザー：全員        ← 匿名でも呼べるようにする（合言葉が鍵）
 *   4. 出てきた …/exec の URL を、旅程プランナーの「設定 → クラウドに保存」に貼る
 *
 * 更新したときは「デプロイを管理」→ 鉛筆 →「バージョン：新バージョン」→ デプロイ（URL は変わらない）
 */

var FOLDER_NAME = '旅程プランナー';
var KEEP_DAYS = 30;          // 過去の版を何日ぶん残すか
var MAX_BYTES = 5000000;     // 1回に受け取る大きさの上限（約5MB。ふつうの旅程は数十KB）

function doGet(e) {
  var p = (e && e.parameter) || {};
  var k = keyOf(p);
  if (!k) return out({ ok: false, error: 'key' });
  if (p.op === 'ping') return out({ ok: true, app: 'trip', v: 1 });
  var rec = read(k);
  return out({ ok: true, app: 'trip', updated: rec.updated, data: rec.data, device: rec.device });
}

function doPost(e) {
  var body;
  try {
    var raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BYTES) return out({ ok: false, error: 'large' });
    body = JSON.parse(raw);
  } catch (err) {
    return out({ ok: false, error: 'json' });
  }
  var k = keyOf(body);
  if (!k) return out({ ok: false, error: 'key' });
  var data = String(body.data || '');
  if (!/^[zr][A-Za-z0-9_-]+$/.test(data)) return out({ ok: false, error: 'data' });   // アプリが作る形だけ受け付ける

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return out({ ok: false, error: 'busy' });
  }
  try {
    var cur = read(k);
    // base（アプリが最後に見たサーバーの更新時刻）が食い違う＝別の端末が先に保存している
    if (body.base != null && Number(body.base) !== Number(cur.updated)) {
      return out({ ok: false, conflict: true, updated: cur.updated, data: cur.data, device: cur.device });
    }
    var rec = { updated: Date.now(), data: data, device: String(body.device || '').slice(0, 40) };
    snapshot(k, cur);
    write(k, rec);
    return out({ ok: true, updated: rec.updated });
  } finally {
    lock.releaseLock();
  }
}

// ---- 中身 ------------------------------------------------------------

function keyOf(o) {
  var k = String((o && o.k) || '');
  return /^[a-f0-9]{32}$/.test(k) ? k : '';   // アプリが作るハッシュ以外は受け付けない
}

function fileName(k) { return 'trip_' + k + '.json'; }
function snapName(k, day) { return 'trip_' + k + '_' + day + '.json'; }

function folder() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function findFile(name) {
  var it = folder().getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function read(k) {
  var f = findFile(fileName(k));
  if (!f) return { updated: 0, data: '', device: '' };
  try {
    var o = JSON.parse(f.getBlob().getDataAsString());
    return { updated: Number(o.updated) || 0, data: String(o.data || ''), device: String(o.device || '') };
  } catch (err) {
    return { updated: 0, data: '', device: '' };
  }
}

function write(k, rec) {
  var json = JSON.stringify(rec);
  var f = findFile(fileName(k));
  if (f) f.setContent(json);
  else folder().createFile(fileName(k), json, MimeType.PLAIN_TEXT);
}

/** 上書きする前の版を、その日の控えとして残す（1日1つ。古いものから消す） */
function snapshot(k, cur) {
  if (!cur || !cur.data) return;
  var day = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  if (findFile(snapName(k, day))) return;
  folder().createFile(snapName(k, day), JSON.stringify(cur), MimeType.PLAIN_TEXT);
  var re = new RegExp('^trip_' + k + '_(\\d{8})\\.json$');
  var all = [];
  var it = folder().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var m = f.getName().match(re);
    if (m) all.push({ day: m[1], file: f });
  }
  all.sort(function (a, b) { return a.day < b.day ? 1 : -1; });
  all.slice(KEEP_DAYS).forEach(function (x) { x.file.setTrashed(true); });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
