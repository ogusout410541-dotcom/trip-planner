// テストの共通部品
// ・Chrome（puppeteer-core）を起動し、tools/serve.js で配信した index.html を開く
// ・外部の通信（駅データ・地図・時刻表・フォント）は既定で止める＝結果が日によって変わらないように
// ・app(page) で Vue の setup が返した公開名（state, dayIssues …）を直接さわれる
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const serve = require('../tools/serve.js');

const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = serve.ROOT;
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let server = null;
async function base() {
  if (!server) server = await serve.start(0);
  return server.url;
}

async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run', '--lang=ja-JP'] });
}

/* 新しいタブで開く。
   opts.storage … 開く前に localStorage へ入れておく {key: 値(文字列 or オブジェクト)}
   opts.width/height/dark/online/now(ISO文字列＝時計を止める) */
async function open(browser, opts = {}) {
  const url = await base();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  // 止めた外部通信の失敗は数えない。こちらの配信で 404 が出たら（favicon 以外）数える
  page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(url) && !/favicon\.ico$/.test(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.errors = errors;
  await page.setViewport({ width: opts.width || 1280, height: opts.height || 900, deviceScaleFactor: 1, isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: opts.dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (!opts.online) {
    await page.setRequestInterception(true);
    page.on('request', req => {
      const u = req.url();
      if (u.startsWith(url) || u.startsWith('data:') || u.startsWith('blob:')) req.continue();
      else req.abort('blockedbyclient');
    });
  }
  // 「新しくなったこと」はテストの邪魔なので既定では既読にしておく（version.js で別に確かめる）
  const seed = { dark_mode: opts.dark ? '1' : '0', net_enabled_v1: '0', trip_seen_version_v1: '999.0.0', ...(opts.storage || {}) };
  await page.evaluateOnNewDocument((seed, now) => {
    if (!sessionStorage.getItem('__seeded')) {
      localStorage.clear();
      for (const [k, v] of Object.entries(seed)) {
        if (v === null) continue;
        localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      }
      sessionStorage.setItem('__seeded', '1');
    }
    if (now) {
      const fixed = new Date(now).getTime();
      const start = Date.now();
      const RealDate = Date;
      // 時計だけ進む固定時刻（当日モードの検証用）
      class FakeDate extends RealDate {
        constructor(...a) { super(...(a.length ? a : [fixed + (RealDate.now() - start)])); }
        static now() { return fixed + (RealDate.now() - start); }
      }
      window.Date = FakeDate;
    }
    // 1日1回の自動バックアップ（ファイルの書き出し）がテスト中に走らないように
    if (localStorage.getItem('trip_last_backup_v1') == null) {
      const d = new Date();
      localStorage.setItem('trip_last_backup_v1', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }, seed, opts.now || null);
  await page.goto(url + (opts.path || 'index.html') + (opts.hash || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => { const el = document.querySelector('#app'); return el && el._vnode && el._vnode.component; }, { timeout: 20000 });
  await sleep(150);
  return page;
}

/* setup の公開名を呼ぶ。fn は page 内で (A) => … として走る（A = setupState） */
function app(page, fn, ...args) {
  return page.evaluate((src, args) => {
    // 本番版の Vue は app._instance を持たないので、描画した vnode から setup の中身をたどる
    const A = document.querySelector('#app')._vnode.component.setupState;
    return (0, eval)('(' + src + ')')(A, ...args);
  }, fn.toString(), args);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 小さな検査器。t.ok(条件, 名前) を並べ、最後に t.done() */
function suite(name) {
  const res = { name, pass: 0, fail: 0, fails: [] };
  const t = {
    ok(cond, label, detail) {
      if (cond) res.pass++;
      else { res.fail++; res.fails.push(label + (detail !== undefined ? ' … ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 400) : '')); }
      return !!cond;
    },
    eq(a, b, label) { return t.ok(JSON.stringify(a) === JSON.stringify(b), label, { got: a, want: b }); },
    async done() {
      if (server) { await server.close(); server = null; }
      const line = `${res.fail ? 'NG' : 'OK'}  ${name}: ${res.pass}/${res.pass + res.fail}`;
      console.log(line);
      res.fails.forEach(f => console.log('    ✗ ' + f));
      if (process.send) process.send(res);
      process.exitCode = res.fail ? 1 : 0;
      return res;
    },
  };
  return t;
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
}

/* 旅程1件を「保存済みの状態」として localStorage に置く形を作る */
function tripStorage(data, id = 'tfixture') {
  const days = data.days || [];
  return {
    trip_index_v1: [{ id, title: data.title || '旅程', startDate: data.startDate || '', endDate: data.endDate || '', status: 'wip', dayCount: days.length, eventCount: days.reduce((n, d) => n + (d.events || []).length, 0) }],
    trip_current_id_v1: id,
    ['trip_data_' + id]: data,
  };
}

module.exports = { launch, open, app, sleep, suite, fixture, tripStorage, ROOT, OUT, base };
