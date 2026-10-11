// オフライン：Service Worker を入れたあと、圏外で開き直しても使えること
// （puppeteer の通信の横取りを使うと SW が素通りされるので、このテストだけは横取りしない）
const fs = require('fs');
const path = require('path');
const { launch, open, app, suite, sleep, ROOT } = require('./lib');

(async () => {
  const t = suite('オフライン');
  const browser = await launch();
  try {
    const page = await open(browser, { online: true, storage: { trip_sw_force_v1: '1' } });
    await page.waitForFunction(() => navigator.serviceWorker.controller || false, { timeout: 15000 }).catch(() => {});
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 15000 });
    await sleep(500);
    const st = await app(page, A => ({ cache: A.swState.cache, count: A.swState.count, v: A.APP_VERSION }));
    const assets = (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g) || []).length;
    t.ok(st.cache === 'trip-v' + st.v, 'この端末に今の版が保存される', st);
    t.ok(st.count === assets, '本体の一式がすべて保存される', { 保存: st.count, 一式: assets });
    for (const f of (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1))) {
      if (f !== './') t.ok(fs.existsSync(path.join(ROOT, f)), `一式のファイルが実在する：${f}`);
    }

    // 圏外で開き直す
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const el = document.querySelector('#app'); return el && el._vnode && el._vnode.component; }, { timeout: 15000 });
    await sleep(300);
    const r = await page.evaluate(() => ({
      header: !!document.querySelector('header'),
      icons: getComputedStyle(document.querySelector('.fa-solid'), '::before').content,
      tw: getComputedStyle(document.querySelector('header')).position,
    }));
    t.ok(r.header, '圏外でも画面が出る', r);
    t.ok(r.icons && r.icons !== 'none' && r.icons !== 'normal', '圏外でもアイコンが出る', r);
    t.ok(r.tw === 'sticky', '圏外でも見た目（Tailwind）が効く', r);
    await app(page, A => A.openDayMode());
    t.ok(await app(page, A => A.dayMode.on), '圏外でも当日モードが開く');
    t.ok(!page.errors.filter(e => !/net::|Failed to fetch|fonts\.g/.test(e)).length, '圏外でエラーなし', page.errors);
    await page.setOfflineMode(false);
    await page.evaluate(async () => { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); for (const k of await caches.keys()) await caches.delete(k); });
    await page.close();

    // localhost では、強制しない限り SW を入れない（古いキャッシュで混乱しないように）
    const p2 = await open(browser, { online: true });
    await sleep(800);
    const regs = await p2.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    t.ok(regs === 0, 'localhost では Service Worker を入れない', regs);
    await p2.close();
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
