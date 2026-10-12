// スマホで作業するときの見張り（390×844・タッチ操作）
// ・入力欄は 16px 以上（iOS が触れた瞬間に拡大しない）  ・押す場所は 32px 未満を作らない
// ・編集画面の「保存」は開いた直後から押せる  ・最初の予定が1画面目に入る
// ・旅程の管理で名前が読める幅  ・モーダルの後ろは止まる  ・カードを押すと編集が開く
const { launch, open, app, suite, fixture, tripStorage, sleep } = require('./lib');

const probe = () => {
  const dlg = document.querySelector('[data-daymode]') || [...document.querySelectorAll('[role="dialog"]')].pop() || document.querySelector('main');
  const vis = (el) => { const b = el.getBoundingClientRect(); const st = getComputedStyle(el); return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 20);
  const small = [...dlg.querySelectorAll('button, input, select, textarea')].filter(vis)
    .filter(el => el.type !== 'checkbox' && el.type !== 'radio' && el.type !== 'file')
    .filter(el => { const b = el.getBoundingClientRect(); return b.height < 32 || b.width < 32; }).map(name);
  const zoom = [...dlg.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')].filter(vis)
    .filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).map(name);
  const narrowInputs = [...dlg.querySelectorAll('input[type=text], input:not([type]), input[type=time]')].filter(vis)
    .filter(el => el.getBoundingClientRect().width < 64).map(name);
  return { small, zoom, narrowInputs };
};

(async () => {
  const t = suite('スマホでの作業');
  const browser = await launch();
  const data = fixture('sample-fes.json');
  const opts = { width: 390, height: 844, mobile: true, storage: { ...tripStorage(data), trip_day_ask_v1: '2099-01-01' } };
  try {
    const screens = [
      ['ふだんの画面', () => null],
      ['予定の編集', A => { A.openEdit(0, A.state.days[0].events[1]); return null; }],
      ['予定の追加', A => { A.openAdd(0); return null; }],
      ['追加メニュー', A => { A.openAddMenu(0); return null; }],
      ['移動を追加', A => { A.openMoveWizard(0, 0); return null; }],
      ['旅程の管理', A => { A.showTripPanel = true; return null; }],
      ['設定', A => { A.showSettings = true; return null; }],
      ['当日モード', A => { A.openDayMode(); return null; }],
    ];
    for (const [name, fn] of screens) {
      const page = await open(browser, opts);
      await app(page, fn);
      await sleep(350);
      const r = await page.evaluate(probe);
      t.ok(!r.zoom.length, `${name}：入力欄は 16px 以上`, r.zoom);
      t.ok(!r.small.filter(x => !/developer\.odpt\.org/.test(x)).length, `${name}：32px 未満の押す場所がない`, r.small);
      t.ok(!r.narrowInputs.length, `${name}：つぶれた入力欄がない`, r.narrowInputs);
      await page.close();
    }

    // 電車の経路（駅が3つ）：駅名・時刻の欄が読める幅
    let page = await open(browser, opts);
    await app(page, A => { const e = A.state.days[0].events[1]; e.route = [{ name: '大井町', depTime: '07:00' }, { name: '大崎', arrTime: '07:05', depTime: '07:09' }, { name: 'さいたま新都心', arrTime: '07:58' }]; A.openEdit(0, e); return null; });
    await sleep(350);
    let r = await page.evaluate(() => {
      const w = (sel) => [...document.querySelectorAll(sel)].map(el => Math.round(el.getBoundingClientRect().width));
      const save = [...document.querySelectorAll('[data-modal="edit"] button')].find(b => b.textContent.trim() === '保存');
      const sb = save.getBoundingClientRect();
      return { names: w('[data-modal="edit"] input[id^="stop-"]'), times: w('[data-modal="edit"] .modal-inner input[type=time]'), save: [Math.round(sb.top), Math.round(sb.bottom), innerHeight], lock: getComputedStyle(document.documentElement).overflow };
    });
    t.ok(r.names.length === 3 && r.names.every(x => x >= 140), '駅名の欄が読める幅（140px 以上）', r.names);
    t.ok(r.times.every(x => x >= 90), '時刻の欄が読める幅（90px 以上）', r.times);
    t.ok(r.save[0] >= 0 && r.save[1] <= r.save[2], '編集を開いた直後から「保存」が見えている', r.save);
    t.ok(r.lock === 'hidden', 'モーダルを開いている間は後ろの画面が止まる', r.lock);
    await app(page, A => A.closeEdit());
    await sleep(200);
    t.ok((await page.evaluate(() => getComputedStyle(document.documentElement).overflow)) !== 'hidden', '閉じたら後ろの画面がまた動く');

    // すでにある予定はカテゴリをたたむ／新しい予定は開いておく
    await app(page, A => { A.openEdit(0, A.state.days[0].events[2]); return null; });
    await sleep(200);
    t.ok(!(await app(page, A => A.catOpen)), 'すでにある予定はカテゴリを1行にたたむ');
    await app(page, A => { A.closeEdit(); A.openAdd(0); return null; });
    await sleep(200);
    t.ok(await app(page, A => A.catOpen), '新しい予定はカテゴリを選べるように開いておく');
    await app(page, A => A.closeEdit());
    await page.close();

    // ふだんの画面：最初の予定が1画面目に入る／点検と日の操作はたたむ
    page = await open(browser, opts);
    r = await page.evaluate(() => ({ first: Math.round(document.querySelector('.ev-card').getBoundingClientRect().top), list: !!document.querySelector('.isu') && document.querySelector('.isu').getBoundingClientRect().height > 0 }));
    t.ok(r.first < 844 - 120, '最初の予定が1画面目に入る', r);
    t.ok(!r.list, 'スマホ幅では点検の一覧をたたんでおく', r);
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^見る/.test(x.textContent.trim())); b.click(); });
    await sleep(150);
    t.ok(await page.evaluate(() => document.querySelector('.isu').getBoundingClientRect().height > 0), '「見る」で点検の一覧が開く');
    // カードを押すと編集が開く
    await page.evaluate(() => document.querySelectorAll('.ev-card')[0].click());
    await sleep(150);
    t.ok(await app(page, A => !!A.editing), 'カードを押すと編集が開く');
    await app(page, A => A.closeEdit());
    // スクロールしたらヘッダーが薄くなる
    const h0 = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().height);
    await page.evaluate(() => window.scrollTo(0, 600));
    await sleep(300);
    const h1 = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().height);
    t.ok(h1 <= h0 - 25, 'スクロールしたらヘッダーが薄くなる（予算の帯を畳む）', { 前: h0, 後: h1 });
    await page.close();

    // 旅程の管理：名前が読める幅
    page = await open(browser, opts);
    await app(page, A => { A.showTripPanel = true; return null; });
    await sleep(300);
    r = await page.evaluate(() => Math.round(document.querySelector('[data-modal="trip"] .line-clamp-2').getBoundingClientRect().width));
    t.ok(r >= 160, '旅程の管理で名前が読める幅（160px 以上）', r);
    t.ok(!page.errors.length, 'エラーなし', page.errors);
    await page.close();
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
