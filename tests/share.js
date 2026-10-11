// スマホで開く：旅程をリンクに詰めて、別の端末（＝まっさらな置き場）で受け取れること
// ・中身が欠けずに往復する  ・同じ旅程なら置き換え（元に戻せる）／別に足す  ・受け取らない
// ・壊れたリンクでも落ちない  ・小さい旅程は QR が出る
const { launch, open, app, suite, fixture, tripStorage, sleep } = require('./lib');
const { bigTrip } = require('./fixtures/gen');

const shape = (A) => JSON.stringify({ title: A.state.title, days: A.state.days.map(d => ({ date: d.date, ev: d.events.map(e => [e.type, e.title, e.startTime, e.endTime, e.location, e.cost, e.paid, e.seat, (e.route || []).map(s => [s.name, s.depTime, s.arrTime, s.depPlatform, s.line, s.dest, !!s.through, !!s.quick].map(v => v == null ? '' : v))]) })) });

(async () => {
  const t = suite('スマホで開く');
  const browser = await launch();
  try {
    // ── 送る側 ──
    const pc = await open(browser, { storage: tripStorage(fixture('sample-fes.json'), 'tsrc') });
    await app(pc, A => { A.state.days[0].events[1].paid = true; A.state.days[0].events[1].route = [{ name: '大井町', depTime: '07:00', depPlatform: '3番線', line: 'りんかい線', dest: '川越', through: false }, { name: '大崎', through: true, line: '埼京線' }, { name: 'さいたま新都心', arrTime: '07:58' }]; });
    await app(pc, A => A.openShare());
    await pc.waitForFunction(() => document.querySelector('[data-modal="share"] input'));
    const sent = await app(pc, A => ({ url: A.share.url, qr: !!A.share.qr, shape: null }));
    const want = await app(pc, shape);
    t.ok(/^https:\/\/.+#trip=z[A-Za-z0-9_-]+$/.test(sent.url), 'リンクは公開URL＋#trip=（圧縮）', sent.url.slice(0, 80));
    t.ok(sent.url.length < 6000, 'リンクの長さはほどほど', sent.url.length);
    t.ok(!pc.errors.length, '送る側でエラーなし', pc.errors);
    const hash = sent.url.slice(sent.url.indexOf('#'));
    await pc.close();

    // ── 受け取る側（何も入っていないスマホ）──
    let ph = await open(browser, { width: 390, height: 844, mobile: true, hash });
    await sleep(300);
    let r = await app(ph, A => ({ open: A.incoming.open, exists: A.incoming.exists, title: A.incoming.data && A.incoming.data.title }));
    t.ok(r.open && !r.exists && /fes/.test(r.title), '受け取り画面が出る（初めての旅程）', r);
    await app(ph, A => A.acceptIncoming('add'));
    await sleep(300);
    const got = await app(ph, shape);
    const at = [...got].findIndex((c, i) => c !== want[i]);
    t.ok(got === want, '中身が欠けずに届く（経路・直通・支払い済も）', { got: got.slice(Math.max(0, at - 80), at + 120), want: want.slice(Math.max(0, at - 80), at + 120) });
    r = await app(ph, A => ({ hash: location.hash, n: A.tripIndex.length }));
    t.ok(r.hash === '', '受け取ったらリンクの中身を消す（再読込で二重に取り込まない）', r);
    // 同じリンクをもう一度 → 同じ旅程として置き換えを選べる
    await ph.evaluate((h) => { location.hash = h; }, hash);      // 開いているページにリンクを貼り直す
    await sleep(400);
    r = await app(ph, A => ({ open: A.incoming.open, exists: A.incoming.exists }));
    t.ok(r.open && r.exists, '同じ旅程はこの端末にあると分かる', r);
    await app(ph, A => { A.state.title = 'スマホで直した題名'; });
    await sleep(300);
    await app(ph, A => A.acceptIncoming('replace'));
    await sleep(300);
    r = await app(ph, A => ({ title: A.state.title, n: A.tripIndex.length, toast: A.toast.action && A.toast.action.label }));
    t.ok(/fes/.test(r.title) && r.n === 1, '置き換えると受け取った内容になる（旅程は増えない）', r);
    t.ok(r.toast === '元に戻す', '置き換えは元に戻せる', r);
    await app(ph, A => A.runToastAction());
    await sleep(300);
    r = await app(ph, A => A.state.title);
    t.ok(r === 'スマホで直した題名', '元に戻すと受け取る前の内容に戻る', r);
    t.ok(!ph.errors.length, '受け取る側でエラーなし', ph.errors);
    await ph.close();

    // ── 別の旅程として足す／受け取らない ──
    ph = await open(browser, { width: 390, height: 844, mobile: true, hash, storage: tripStorage(fixture('sample-fes.json'), 'tsrc') });
    await sleep(300);
    await app(ph, A => A.acceptIncoming('add'));
    await sleep(300);
    r = await app(ph, A => A.tripIndex.map(t => t.title));
    t.ok(r.length === 2 && r.some(x => /（受け取り）$/.test(x)), '別の旅程として足すと、題名で見分けられる', r);
    await ph.close();
    ph = await open(browser, { width: 390, height: 844, mobile: true, hash });
    await sleep(300);
    await ph.keyboard.press('Escape');
    r = await app(ph, A => ({ open: A.incoming.open, n: A.tripIndex.length, ev: A.state.days.reduce((n, d) => n + d.events.length, 0), hash: location.hash }));
    t.ok(!r.open && r.ev === 0 && r.hash === '', '受け取らないを選ぶと何も変わらない', r);
    await ph.close();

    // ── 壊れたリンク ──
    for (const bad of ['#trip=zAAAA', '#trip=r' + Buffer.from('{"x":1}').toString('base64url'), '#trip=q123']) {
      const p = await open(browser, { hash: bad });
      await sleep(300);
      const rr = await app(p, A => ({ open: A.incoming.open, toast: A.toast.msg, hash: location.hash }));
      t.ok(!rr.open && /読み取れません/.test(rr.toast) && rr.hash === '', `壊れたリンク（${bad.slice(0, 12)}…）でも落ちずに知らせる`, rr);
      t.ok(!p.errors.length, `壊れたリンク（${bad.slice(0, 12)}…）：エラーなし`, p.errors);
      await p.close();
    }

    // ── 小さい旅程は QR が出る ──
    const small = await open(browser, { storage: tripStorage(bigTrip(1, 6)) });
    await app(small, A => A.openShare());
    await small.waitForFunction(() => document.querySelector('[data-modal="share"] input'));
    r = await small.evaluate(() => !!document.querySelector('[data-modal="share"] svg path'));
    t.ok(r, '小さい旅程は QR コードが出る');
    await small.close();
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
