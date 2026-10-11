// 公開ページの確認（本番を開く。外部通信は止めない）
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const SITE = 'https://ogusout410541-dotcom.github.io/trip-planner/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const A = (p, fn, ...a) => p.evaluate((src, a) => (0, eval)('(' + src + ')')(document.querySelector('#app')._vnode.component.setupState, ...a), fn.toString(), a);
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
  const res = [];
  const ok = (c, l, d) => { res.push((c ? 'OK ' : 'NG ') + l + (c ? '' : ' … ' + JSON.stringify(d))); };
  // ① 公開ページ（スマホ幅）
  const ph = await b.newPage();
  const errs = [];
  ph.on('pageerror', e => errs.push(e.message));
  ph.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await ph.goto(SITE, { waitUntil: 'networkidle0' });
  await ph.waitForFunction(() => document.querySelector('#app')._vnode);
  ok(await A(ph, A => A.APP_VERSION) === '1.1.0', '公開ページが v1.1.0');
  await ph.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const sw = await A(ph, A => ({ cache: A.swState.cache, count: A.swState.count, https: A.swState.https }));
  ok(sw.cache === 'trip-v1.1.0' && sw.count === 13, '圏外用に一式が保存される', sw);
  const man = await ph.evaluate(async () => (await fetch('manifest.webmanifest')).ok && (await fetch('icons/icon-192.png')).ok);
  ok(man, 'マニフェストとアイコンが届く');
  // ② 圏外で開き直す
  await ph.setOfflineMode(true);
  await ph.reload({ waitUntil: 'load' });
  await ph.waitForFunction(() => document.querySelector('#app') && document.querySelector('#app')._vnode, { timeout: 15000 });
  const off = await ph.evaluate(() => ({ header: !!document.querySelector('header'), pos: getComputedStyle(document.querySelector('header')).position }));
  ok(off.header && off.pos === 'sticky', '圏外でも開ける（見た目も効く）', off);
  await ph.setOfflineMode(false);
  // ③ PC 側でリンクを作る（ローカル原本を file:// で開いた想定＝SITE_URL が使われる）
  const pc = await b.newPage();
  await pc.goto('file:///C:/Users/user/Desktop/旅程表アプリ/index.html', { waitUntil: 'load' });
  await pc.waitForFunction(() => document.querySelector('#app')._vnode);
  await A(pc, A => { A.state.title = '公開ページ確認用'; A.state.days[0].date = '2026-10-29'; A.openAdd(0); A.editing.title = 'みこちのライブ'; A.editing.startTime = '18:00'; A.saveEvent(); });
  await A(pc, A => A.openShare());
  await pc.waitForFunction(() => document.querySelector('[data-modal="share"] input'));
  const url = await A(pc, A => A.share.url);
  ok(url.startsWith(SITE + '#trip='), 'PC で作ったリンクの行き先が公開ページ', url.slice(0, 70));
  // ④ スマホ側で受け取る
  await ph.goto(url, { waitUntil: 'load' });
  await ph.waitForFunction(() => document.querySelector('#app')._vnode);
  await sleep(800);
  const inc = await A(ph, A => ({ open: A.incoming.open, title: A.incoming.data && A.incoming.data.title }));
  ok(inc.open && inc.title === '公開ページ確認用', '公開ページでリンクから受け取れる', inc);
  await A(ph, A => A.acceptIncoming('add'));
  await sleep(300);
  const got = await A(ph, A => ({ title: A.state.title, ev: A.state.days[0].events.map(e => e.title) }));
  ok(got.title === '公開ページ確認用' && got.ev.includes('みこちのライブ'), '中身が届く', got);
  ok(!errs.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)).length, 'エラーなし', errs);
  await ph.screenshot({ path: require('path').join(__dirname, 'out', 'live_390.png') });
  console.log(res.join('\n'));
  await b.close();
})();
