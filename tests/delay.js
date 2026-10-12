// 遅れを入れたとき、動かさない予定（ライブ・時刻表どおりに出る乗り物）の時刻を書き換えないこと
// ・その手前で止める  ・食い込んだら知らせる（電車なら「間に合いません」）  ・押した予定そのものはずらす
// ・予定ごとに「動かさない」を切り替えられる  ・日ごとの「時刻をずらす」は今までどおり全部
const { launch, open, app, suite, tripStorage, sleep } = require('./lib');

const trip = () => ({
  title: '遅れの検査', startDate: '2026-11-20', endDate: '2026-11-20',
  days: [{ date: '2026-11-20', events: [
    { id: 'walk', type: 'walk', title: '駅まで歩く', startTime: '06:40', endTime: '06:52' },
    { id: 'train', type: 'train', title: '会場へ', startTime: '07:00', endTime: '07:35', route: [{ name: '徳島', depTime: '07:00' }, { name: '高松', arrTime: '07:35' }] },
    { id: 'meal', type: 'meal', title: '朝ごはん', startTime: '07:50', endTime: '08:25' },
    { id: 'line', type: 'standby', title: '物販列', startTime: '09:00', endTime: '10:00' },
    { id: 'live', type: 'activity', title: 'ライブ', startTime: '10:30', endTime: '12:00' },
    { id: 'lunch', type: 'meal', title: '昼ごはん', startTime: '12:30', endTime: '13:00' },
  ] }],
});
const times = (A) => Object.fromEntries(A.state.days[0].events.map(e => [e.id, e.startTime + '-' + e.endTime + ((e.route || []).length ? '|' + e.route.map(s => s.depTime || s.arrTime).join(',') : '')]));

(async () => {
  const t = suite('遅れと動かさない予定');
  const browser = await launch();
  try {
    const page = await open(browser, { storage: { ...tripStorage(trip()), trip_day_ask_v1: '2099-01-01' } });
    const base = await app(page, times);
    t.ok(await app(page, A => ['train', 'live'].every(id => A.isFixed(A.state.days[0].events.find(e => e.id === id))) && !A.isFixed(A.state.days[0].events.find(e => e.id === 'meal'))),
      '最初から動かさないのは、イベントと電車（食事・列などは動かす）');

    // 朝ごはんから +10分：物販列までずれて、ライブの手前で止まる
    await app(page, A => A.shiftFrom(0, A.state.days[0].events.find(e => e.id === 'meal'), 10));
    let r = await app(page, times);
    t.eq([r.meal, r.line], ['08:00-08:35', '09:10-10:10'], '動かせる予定はずれる');
    t.eq([r.live, r.lunch, r.train], [base.live, base.lunch, base.train], 'ライブとそのあと、前の電車はずれない');
    let msg = await app(page, A => A.toast.msg);
    t.ok(/ライブ.*手前まで/.test(msg), 'どこで止めたかを知らせる', msg);
    await app(page, A => A.undo());
    t.eq(await app(page, times), base, '元に戻すで戻る');

    // +45分：物販列がライブに 15分食い込む
    await app(page, A => A.shiftFrom(0, A.state.days[0].events.find(e => e.id === 'meal'), 45));
    r = await app(page, times);
    msg = await app(page, A => A.toast.msg);
    t.ok(r.live === base.live && /ライブ.*15分食い込みます/.test(msg), '食い込んだら、何分食い込むかを知らせる', msg);
    await app(page, A => A.undo());

    // 歩きが +15分：電車（07:00発）に間に合わない
    await app(page, A => A.shiftFrom(0, A.state.days[0].events.find(e => e.id === 'walk'), 15));
    r = await app(page, times);
    msg = await app(page, A => A.toast.msg);
    t.ok(r.train === base.train && /会場へ.*07:00発.*間に合いません.*7分/.test(msg), '電車は動かさず「間に合いません」と知らせる', msg);
    await app(page, A => A.undo());

    // 電車そのものが遅れた：押した予定はずらす（経路の時刻も）
    await app(page, A => A.shiftFrom(0, A.state.days[0].events.find(e => e.id === 'train'), 10));
    r = await app(page, times);
    t.ok(r.train === '07:10-07:45|07:10,07:45' && r.meal === '08:00-08:35' && r.live === base.live, '遅れた電車そのものはずらし、ライブの手前まで伝える', r);
    await app(page, A => A.undo());

    // 動かさないのを外すと、ライブもずれる
    await app(page, A => A.toggleFixed(A.state.days[0].events.find(e => e.id === 'live')));
    t.ok(await app(page, A => A.state.days[0].events.find(e => e.id === 'live').fixed === false), '予定ごとに「動かさない」を外せる');
    await app(page, A => A.shiftFrom(0, A.state.days[0].events.find(e => e.id === 'meal'), 10));
    r = await app(page, times);
    t.ok(r.live === '10:40-12:10' && r.lunch === '12:40-13:10', '外したライブは一緒にずれる', r);
    await app(page, A => A.undo());
    await app(page, A => A.toggleFixed(A.state.days[0].events.find(e => e.id === 'live')));
    t.ok(await app(page, A => A.state.days[0].events.find(e => e.id === 'live').fixed === null), '戻すとカテゴリの既定に戻る（null）');

    // 日ごとの「時刻をずらす」は今までどおり全部
    await app(page, A => A.shiftDayTimes(0, 30));
    r = await app(page, times);
    t.ok(r.live === '11:00-12:30' && r.walk === '07:10-07:22', '日ごとの「時刻をずらす」は全部ずらす', r);
    await app(page, A => A.undo());

    // 保存して読み直しても「動かさない」が残る
    await app(page, A => { A.state.days[0].events.find(e => e.id === 'meal').fixed = true; });
    await sleep(400);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const el = document.querySelector('#app'); return el && el._vnode && el._vnode.component; });
    await sleep(200);
    t.ok(await app(page, A => A.state.days[0].events.find(e => e.id === 'meal').fixed === true), '保存して読み直しても残る');

    // 画面：カードの「固定」、カードのメニューの説明、編集画面の切り替え
    t.ok(await page.evaluate(() => [...document.querySelectorAll('.ev-card')].filter(c => /固定/.test(c.textContent)).length >= 3), 'カードに「固定」の印が出る');
    await app(page, A => { A.openEdit(0, A.state.days[0].events.find(e => e.id === 'live')); return null; });
    await sleep(200);
    t.ok(await page.evaluate(() => { const cb = [...document.querySelectorAll('[data-modal="edit"] input[type=checkbox]')].find(x => /時刻を動かさない/.test(x.closest('label').textContent)); return cb && cb.checked; }), '編集画面に「時刻を動かさない」があり、ライブは最初から入っている');
    await app(page, A => A.closeEdit());
    t.ok(!page.errors.length, 'エラーなし', page.errors);
    await page.close();

    // 当日モード：遅れの説明に、どこで止めるかが出る
    const dmp = await open(browser, { width: 390, height: 844, mobile: true, now: '2026-11-20T07:55:00', storage: { ...tripStorage(trip()), trip_day_ask_v1: '2099-01-01' } });
    await app(dmp, A => A.openDayMode());
    await dmp.click('.dm-act');
    await sleep(80);
    const head = await dmp.evaluate(() => document.querySelector('.dm-delay-head').textContent);
    t.ok(/朝ごはん.*ライブ.*手前まで/.test(head), '当日モードでも、どこまでずらすかが出る', head);
    await dmp.close();
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
