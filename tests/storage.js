// 端末に残ったデータが壊れていても、起動でき、ほかの旅程を失わないこと
// （ライブログで「localStorage の形が想定と違うと真っ白」を踏んだのと同じ種類の事故を防ぐ）
const { launch, open, app, suite, fixture, sleep } = require('./lib');

const good = (title) => ({ title, startDate: '2026-10-29', endDate: '2026-10-29', days: [{ date: '2026-10-29', events: [{ id: 'e1', type: 'event', title: 'ライブ', startTime: '18:00' }] }] });
const idx = (...ids) => ids.map((id, i) => ({ id, title: '旅程' + (i + 1), startDate: '', endDate: '', status: 'wip', dayCount: 1, eventCount: 1 }));

(async () => {
  const t = suite('壊れたデータ');
  const browser = await launch();
  const cases = [
    { name: '開いている旅程のJSONが途中で切れている', cur: '{"title":"壊れ', other: true },
    { name: '開いている旅程が null', cur: 'null', other: true },
    { name: '開いている旅程が文字列', cur: '"abc"', other: true },
    { name: '日程に null が混ざる', cur: JSON.stringify({ title: 'A', days: [null, { events: [null, { type: 'train', route: [null, { name: '横浜' }] }] }] }), other: true, keepCur: true },
    { name: '予定の中身が壊れている', cur: JSON.stringify({ title: 'A', days: [{ events: [{ type: 'train', route: 'x', startTime: 5, title: null }] }] }), other: true, keepCur: true },
    { name: '一覧が配列でない', index: '{"a":1}', cur: JSON.stringify(good('A')), other: true, keepCur: true, rebuilt: true },
    { name: '一覧が読めない文字列', index: '[{"id"', cur: JSON.stringify(good('A')), other: true, keepCur: true, rebuilt: true },
  ];
  for (const c of cases) {
    const storage = {
      trip_index_v1: c.index != null ? c.index : JSON.stringify(idx('tA', 'tB')),
      trip_current_id_v1: 'tA',
      trip_data_tA: c.cur,
    };
    if (c.other) storage.trip_data_tB = JSON.stringify(good('ほかの旅程'));
    let page;
    try {
      page = await open(browser, { storage });
      await sleep(300);
      const r = await app(page, A => ({
        title: A.state.title, days: A.state.days.length,
        index: A.tripIndex.map(x => x.id), header: !!document.querySelector('header'),
        keys: Object.keys(localStorage),
      }));
      t.ok(!page.errors.length, `${c.name}：エラーなし`, page.errors);
      t.ok(r.header && r.days >= 1, `${c.name}：起動できる`, r);
      if (c.other) t.ok(r.index.includes('tB'), `${c.name}：ほかの旅程が一覧に残る`, r.index);
      if (c.keepCur) t.ok(r.index.includes('tA'), `${c.name}：直せる範囲なら開いている旅程も残る`, r.index);
      if (!c.keepCur) t.ok(r.keys.some(k => k.startsWith('trip_broken_')), `${c.name}：壊れた中身は退避して残す`, r.keys);
      t.ok(r.keys.includes('trip_data_tB'), `${c.name}：ほかの旅程のデータは消さない`, r.keys);
    } catch (e) { t.ok(false, `${c.name}：例外なし`, e.message); }
    if (page) await page.close();
  }

  // 1度開いたあと、再読込してもほかの旅程が残っている（壊れたまま保存し直していない）
  try {
    const page = await open(browser, { storage: { trip_index_v1: JSON.stringify(idx('tA', 'tB')), trip_current_id_v1: 'tA', trip_data_tA: '{"x', trip_data_tB: JSON.stringify(good('ほかの旅程')) } });
    await sleep(400);
    await page.reload({ waitUntil: 'load' });
    await sleep(400);
    const r = await app(page, A => A.tripIndex.map(x => x.id));
    t.ok(r.includes('tB'), '再読込後もほかの旅程が一覧に残る', r);
    await page.close();
  } catch (e) { t.ok(false, '再読込の検査で例外なし', e.message); }

  await browser.close();
  t.done();
})();
