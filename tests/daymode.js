// 当日モード：時計を固定して、「いま」「次」「乗換」が正しく選ばれるか、
// 遅れの反映・画面のはみ出し・押しやすさ・端末ごとの記憶を確かめる
const path = require('path');
const { launch, open, app, suite, fixture, tripStorage, sleep, OUT } = require('./lib');
const { bigTrip } = require('./fixtures/gen');

const pick = (A) => {
  const d = A.dm;
  const t = (x) => x ? x.e.title : null;
  return { idx: d.idx, status: d.status, over: d.tripOver, until: d.daysUntil, current: t(d.current), next: t(d.next), step: d.step ? { kind: d.step.kind, k: d.step.k } : null, after: d.after.length, done: d.done.length };
};

(async () => {
  const t = suite('当日モード');
  const browser = await launch();
  const sample = fixture('sample-fes.json');
  const train = bigTrip(1, 5, '2026-11-20');   // 07:00 発の電車（途中で乗換）から始まる1日
  try {
    const cases = [
      ['旅行の9日前', sample, '2026-09-10T12:00:00', r => r.status === 'before' && r.idx === 0 && r.until === 9 && r.next === '自宅を出発'],
      ['初日の出発前', sample, '2026-09-19T05:00:00', r => r.status === 'live' && r.idx === 0 && !r.current && r.next === '自宅を出発'],
      ['電車に乗っている', sample, '2026-09-19T07:30:00', r => r.idx === 0 && r.current === '会場最寄りへ' && r.next === '物販列に並ぶ'],
      ['ライブの最中', sample, '2026-09-19T18:00:00', r => r.current === 'hololive 5th fes. Day1' && r.next === 'アリーナ → 大宮駅'],
      ['日付が変わった深夜', sample, '2026-09-20T01:00:00', r => r.idx === 1 && !r.current && r.next === 'ホテルを出発'],
      ['2日目の昼', sample, '2026-09-20T14:40:00', r => r.idx === 1 && r.current === '昼食：もつ鍋' && r.done >= 5],
      ['旅行が終わったあと', sample, '2026-09-25T12:00:00', r => r.over === true && r.idx === 2],
      ['乗換駅に着く前', train, '2026-11-20T07:10:00', r => r.current && r.step && r.step.kind === 'arr' && r.step.k === 1],
      ['乗換駅で次の列車を待つ', train, '2026-11-20T07:17:00', r => r.current && r.step && r.step.kind === 'dep' && r.step.k === 1],
      ['降りる駅に向かう', train, '2026-11-20T07:25:00', r => r.current && r.step && r.step.kind === 'arr' && r.step.k === 2],
    ];
    for (const [name, data, now, check] of cases) {
      const page = await open(browser, { width: 390, height: 844, mobile: true, now, storage: tripStorage(data) });
      await app(page, A => A.openDayMode());
      await sleep(80);
      const r = await app(page, pick);
      t.ok(check(r), name, r);
      t.ok(!page.errors.length, `${name}：エラーなし`, page.errors);
      await page.close();
    }

    // ── 画面：はみ出し・押しやすさ・明暗 ──
    for (const dark of [false, true]) {
      for (const width of [360, 390, 1280]) {
        const label = `${width}px・${dark ? '暗' : '明'}`;
        const page = await open(browser, { width, height: 800, mobile: width < 600, dark, now: '2026-11-20T07:10:00', storage: tripStorage(train) });
        await app(page, A => A.openDayMode());
        await sleep(120);
        const r = await page.evaluate(() => {
          const root = document.querySelector('[data-daymode]');
          const over = [...root.querySelectorAll('*')].filter(el => { const b = el.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1); }).map(el => el.className.toString().slice(0, 40));
          const small = [...root.querySelectorAll('button, a')].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.height < 32; }).map(el => (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 20));
          return { over, small, sw: document.documentElement.scrollWidth, cw: innerWidth };
        });
        t.ok(!r.over.length, `${label}：はみ出さない`, r.over.slice(0, 5));
        t.ok(!r.small.length, `${label}：ボタンが小さすぎない`, r.small);
        if (width === 390) await page.screenshot({ path: path.join(OUT, `daymode_${dark ? 'dark' : 'light'}.png`), fullPage: false });
        await page.close();
      }
    }

    // ── 遅れの反映と取り消し ──
    {
      const page = await open(browser, { width: 390, height: 844, mobile: true, now: '2026-11-20T07:10:00', storage: tripStorage(train) });
      await app(page, A => A.openDayMode());
      const before = await app(page, A => A.state.days[0].events.map(e => e.startTime + '|' + (e.route || []).map(s => s.depTime).join(',')));
      await page.click('.dm-act');                         // 遅れを入れる
      await sleep(50);
      const btns = await page.$$('.dm-delay-btn');
      t.ok(btns.length === 5, '遅れの選択肢が出る', btns.length);
      await btns[1].click();                                // +10分
      await sleep(50);
      const after = await app(page, A => A.state.days[0].events.map(e => e.startTime + '|' + (e.route || []).map(s => s.depTime).join(',')));
      t.ok(after[0].startsWith('07:10|07:10,07:30'), 'いまの予定から後ろが10分ずれる（経路の時刻も）', after[0]);
      t.ok(after.every((x, i) => x !== before[i]), '後ろの予定もすべてずれる', { before, after });
      await app(page, A => A.undo());
      const back = await app(page, A => A.state.days[0].events.map(e => e.startTime + '|' + (e.route || []).map(s => s.depTime).join(',')));
      t.eq(back, before, '元に戻すで戻る');
      await page.close();
    }

    // ── 端末ごとの記憶・1日1回のおたずね・閉じる ──
    {
      const page = await open(browser, { width: 390, height: 844, mobile: true, now: '2026-09-19T07:30:00', storage: { ...tripStorage(sample), trip_day_ask_v1: null } });
      let r = await app(page, A => ({ on: A.dayMode.on, toast: A.toast.show && A.toast.action && A.toast.action.label }));
      t.ok(!r.on && r.toast === '当日モードにする', '旅程の日に開くと当日モードをすすめる', r);
      await app(page, A => A.runToastAction());
      r = await app(page, A => A.dayMode.on);
      t.ok(r, 'すすめから当日モードに入れる');
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => { const el = document.querySelector('#app'); return el && el._vnode && el._vnode.component; });
      await sleep(200);
      r = await app(page, A => ({ on: A.dayMode.on, toast: A.toast.show }));
      t.ok(r.on, '開き直しても当日モードのまま', r);
      await page.keyboard.press('Escape');
      r = await app(page, A => ({ on: A.dayMode.on, ls: localStorage.getItem('trip_day_mode_v1') }));
      t.ok(!r.on && r.ls === '0', 'Escで閉じ、閉じたことも覚える', r);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => { const el = document.querySelector('#app'); return el && el._vnode && el._vnode.component; });
      await sleep(200);
      r = await app(page, A => ({ on: A.dayMode.on, toast: A.toast.show && A.toast.action && A.toast.action.label }));
      t.ok(!r.on && r.toast !== '当日モードにする', '同じ日には二度すすめない', r);
      t.ok(!page.errors.length, 'エラーなし', page.errors);
      await page.close();
    }
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
