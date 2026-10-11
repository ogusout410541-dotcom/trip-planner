// クラウドに保存（GAS）：本物の gas/コード.gs を偽の Google サービスで動かし、端末2つ（PC・スマホ）で確かめる
// ・つなぐと全旅程が保存される  ・直すと数秒で保存される
// ・Cookie を消した端末でも、合言葉で全部戻る（空の端末がクラウドを上書きしない）
// ・2つの端末で別々に直しても、両方の変更が残る  ・圏外のあいだに直したぶんは、つながったら送る
// ・URL の間違い・合言葉の短さを断る  ・両方に旅程があるときは選ばせる  ・設定をリンクでスマホへ渡せる
const { launch, open, app, suite, fixture, tripStorage, sleep } = require('./lib');
const { startGas } = require('./_gas_fake');
const { bigTrip } = require('./fixtures/gen');

const PHRASE = 'oshi-katsu-2026';
const names = (A) => A.tripIndex.map(t => t.title).sort();
const allEvents = (A) => {
  const out = [];
  A.tripIndex.forEach(t => { const d = JSON.parse(localStorage.getItem('trip_data_' + t.id)); d.days.forEach(x => x.events.forEach(e => out.push(e.title))); });
  return out.sort();
};
async function connect(page, url, phrase = PHRASE) {
  await app(page, (A, u, p) => { A.openCloudForm(); A.cloud.formUrl = u; A.cloud.formPhrase = p; }, url, phrase);
  await app(page, A => A.connectCloud());
  await page.waitForFunction(() => { const A = document.querySelector('#app')._vnode.component.setupState; return !A.cloud.busy && !A.cloud.testing; }, { timeout: 15000 });
  return app(page, A => ({ status: A.cloud.status, error: A.cloud.error, on: A.cloudOn, ask: !!A.cloud.ask }));
}
const waitIdle = (page) => page.waitForFunction(() => { const A = document.querySelector('#app')._vnode.component.setupState; return !A.cloud.busy; }, { timeout: 15000 });

(async () => {
  const t = suite('クラウドに保存');
  const gas = await startGas();
  const browser = await launch();
  const allow = [gas.base];
  // 端末ごとに別の文脈を使う（同じ文脈のタブは localStorage を共有してしまう）
  const device = async () => browser.createBrowserContext();
  try {
    // ── PC：2つの旅程を作ってつなぐ ──
    const two = tripStorage(fixture('sample-fes.json'), 'tA');
    const b = bigTrip(2, 4, '2026-10-29'); b.title = 'みこちのライブ遠征';
    two.trip_index_v1.push({ id: 'tB', title: b.title, startDate: b.startDate, endDate: b.endDate, status: 'wip', dayCount: 2, eventCount: 8 });
    two.trip_data_tB = b;
    const pc = await open(await device(), { storage: two, allow });
    let r = await connect(pc, 'https://example.com/not-gas');
    t.ok(!r.on, 'GAS でない URL ではつながない', r);
    r = await app(pc, A => A.toast.msg);
    t.ok(/exec/.test(r), 'URL の形を案内する', r);
    r = await connect(pc, gas.url, 'short');
    t.ok(!r.on && /8文字/.test(await app(pc, A => A.toast.msg)), '短い合言葉は断る', r);
    r = await connect(pc, '  ' + gas.url + '/ \n', PHRASE);
    t.ok(r.on && r.status === 'ok', '前後の空白や末尾の / があってもつながる', r);
    t.ok(gas.files.size >= 1 && [...gas.files.values()].some(f => JSON.parse(f.content).data), 'クラウドに保存される', [...gas.files.keys()]);
    const pcNames = await app(pc, names);
    const pcEvents = await app(pc, allEvents);
    t.ok(await pc.evaluate(() => !!document.querySelector('[data-cloud-mark]')), 'ヘッダーに雲の印が出る');

    // ── 直すと数秒で保存される ──
    const posts0 = gas.posts;
    await app(pc, A => { A.openAdd(0); A.editing.title = 'PCで足した予定'; A.editing.startTime = '05:00'; A.saveEvent(); });
    await sleep(5500);
    await waitIdle(pc);
    t.ok(gas.posts > posts0 && (await app(pc, A => A.cloud.status)) === 'ok', '直すと数秒で自動保存される', { posts: gas.posts - posts0 });

    // ── Cookie を消した端末（＝まっさら）：戻せる・上書きしない ──
    const fresh = await open(await device(), { allow, storage: {} });
    t.ok(await fresh.evaluate(() => !!document.querySelector('[data-restore]')), '旅程が無いと「前に作った旅程を戻せます」が出る');
    const before = [...gas.files.values()].map(f => f.content).join('|');
    const postsBefore = gas.posts;
    r = await connect(fresh, gas.url);
    t.ok(r.on && r.status === 'ok' && !r.ask, '合言葉を入れるとつながる（空の端末は選ばせずに取り込む）', r);
    t.ok(gas.posts === postsBefore && [...gas.files.values()].map(f => f.content).join('|') === before, '空の端末はクラウドを上書きしない');
    t.eq(await app(fresh, names), pcNames, '旅程が全部戻る');
    t.eq(await app(fresh, allEvents), [...pcEvents, 'PCで足した予定'].sort(), '予定も全部戻る（直したぶんも）');
    t.ok(!(await app(fresh, A => A.tripIndex.some(x => x.title === '新しい旅程'))), '空の「新しい旅程」は残らない');
    t.ok(!(await fresh.evaluate(() => !!document.querySelector('[data-restore]'))), '戻したら案内は消える');

    // ── 2つの端末で別々に直す ──
    await app(pc, A => { A.state.days[0].events[0].title = 'PCで直したタイトル'; });
    await app(fresh, (A) => { const i = A.tripIndex.findIndex(x => x.title === 'みこちのライブ遠征'); A.switchTrip(A.tripIndex[i].id); });
    await sleep(200);
    await app(fresh, A => { A.state.days[1].events[0].title = 'スマホで直したタイトル'; });
    await app(pc, A => A.cloudSync());
    await waitIdle(pc);
    await app(fresh, A => A.cloudSync());
    await waitIdle(fresh);
    await app(pc, A => A.cloudSync());
    await waitIdle(pc);
    const ev1 = await app(pc, allEvents), ev2 = await app(fresh, allEvents);
    t.ok(ev1.includes('PCで直したタイトル') && ev1.includes('スマホで直したタイトル'), 'PC に両方の変更が残る', ev1.slice(0, 6));
    t.eq(ev2, ev1, 'スマホも同じ中身になる');

    // ── 同じ予定を両方で直したとき（落ちずに、どちらかが残る）──
    await app(pc, A => { A.switchTrip('tA'); });
    await sleep(200);
    await app(pc, A => { A.state.days[0].events[0].title = 'PCの案'; });
    await app(fresh, A => { A.switchTrip('tA'); });
    await sleep(200);
    await app(fresh, A => { A.state.days[0].events[0].title = 'スマホの案'; });
    await app(pc, A => A.cloudSync()); await waitIdle(pc);
    await app(fresh, A => A.cloudSync()); await waitIdle(fresh);
    await app(pc, A => A.cloudSync()); await waitIdle(pc);
    const t1 = await app(pc, A => A.state.days[0].events[0].title), t2 = await app(fresh, A => A.state.days[0].events[0].title);
    t.ok(t1 === t2 && ['PCの案', 'スマホの案'].includes(t1), '同じところを両方で直しても、そろう', [t1, t2]);

    // ── 圏外 ──
    await fresh.setOfflineMode(true);
    await app(fresh, A => { A.state.title = '圏外で直した旅程'; });
    await app(fresh, A => A.cloudSync());
    t.ok((await app(fresh, A => A.cloud.status)) === 'offline', '圏外のあいだは「圏外です」');
    await fresh.setOfflineMode(false);
    await app(fresh, A => A.cloudSync()); await waitIdle(fresh);
    await app(pc, A => A.cloudSync()); await waitIdle(pc);
    t.ok((await app(pc, A => A.tripIndex.map(x => x.title))).includes('圏外で直した旅程'), 'つながったら圏外で直したぶんも届く');

    // ── サーバーが落ちている ──
    gas.down = true;
    await app(pc, A => { A.state.title = 'サーバー停止中に直した'; });
    await app(pc, A => A.cloudSync()); await waitIdle(pc);
    r = await app(pc, A => ({ status: A.cloud.status, error: A.cloud.error }));
    t.ok(r.status === 'error' && /サーバー側/.test(r.error), 'サーバーのエラーを知らせる', r);
    t.ok(await pc.evaluate(() => /未保存/.test(document.querySelector('[data-cloud-mark]').textContent)), 'ヘッダーの印が「未保存」になる');
    gas.down = false;
    await app(pc, A => A.cloudSync()); await waitIdle(pc);
    t.ok((await app(pc, A => A.cloud.status)) === 'ok', '直ったら保存できる');

    // ── 両方に旅程がある端末：選ばせる ──
    const other = await open(await device(), { allow, storage: tripStorage(bigTrip(1, 3, '2026-12-01'), 'tZ') });
    await app(other, A => { A.state.title = '別の端末だけの旅程'; });
    await sleep(300);
    r = await connect(other, gas.url);
    t.ok(r.ask && r.status === 'ask', '両方に旅程があるときは、どうするか選ばせる', r);
    await app(other, A => A.cloudChoose('merge'));
    await waitIdle(other);
    const merged = await app(other, A => A.tripIndex.map(x => x.title));
    t.ok(merged.includes('別の端末だけの旅程') && merged.length >= 3, '「両方を合わせる」でどちらの旅程も残る', merged);

    // ── 設定をリンクでスマホへ ──
    await app(pc, A => A.shareCloudConf());
    await pc.waitForFunction(() => { const A = document.querySelector('#app')._vnode.component.setupState; return A.share.url; });
    const link = await app(pc, A => A.share.url);
    t.ok(/#cloud=/.test(link) && !link.includes(PHRASE), '設定のリンクは合言葉をそのまま書かない', link.slice(0, 60));
    const phone = await open(await device(), { allow, width: 390, height: 844, mobile: true, storage: {} });
    phone.on('dialog', d => d.accept());
    await phone.evaluate((h) => { location.hash = h; }, link.slice(link.indexOf('#')));
    await sleep(500);
    await waitIdle(phone);
    r = await app(phone, A => ({ on: A.cloudOn, n: A.tripIndex.length, hash: location.hash }));
    t.ok(r.on && r.n >= 3 && r.hash === '', 'リンクを開くとスマホもつながり、旅程が入る', r);
    t.ok([pc, fresh, other, phone].every(p => !p.errors.length), 'エラーなし', [pc, fresh, other, phone].map(p => p.errors));
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  await gas.close();
  t.done();
})();
