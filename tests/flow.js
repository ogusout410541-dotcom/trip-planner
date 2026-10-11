// 操作の流れ：予定の追加・編集・削除、元に戻す／やり直す、保存と再読込、旅程の切り替え・複製、
// 点検（dayIssues）がどの旅程でも落ちないこと、指摘には必ず「直す案」か「手で直す手引き」があること
const { launch, open, app, suite, fixture, tripStorage, sleep } = require('./lib');
const { bigTrip } = require('./fixtures/gen');

(async () => {
  const t = suite('操作の流れ');
  const browser = await launch();
  try {
    // ── 追加・編集・削除・元に戻す ──
    const page = await open(browser, { storage: tripStorage(fixture('sample-fes.json')) });
    const n0 = await app(page, A => A.state.days[0].events.length);
    await app(page, A => { A.openAdd(0); });
    await sleep(50);
    await app(page, A => { const e = A.editing; e.type = 'meal'; e.title = '検査の昼食'; e.startTime = '12:10'; e.endTime = '12:50'; e.cost = 1200; A.saveEvent(); });
    await sleep(50);
    let r = await app(page, A => ({ n: A.state.days[0].events.length, has: A.state.days[0].events.some(e => e.title === '検査の昼食'), editing: !!A.editing }));
    t.ok(r.n === n0 + 1 && r.has && !r.editing, '予定を追加できる', r);
    r = await app(page, A => { const ev = A.state.days[0].events.find(e => e.title === '検査の昼食'); A.openEdit(0, ev); return !!A.editing; });
    t.ok(r, '編集画面が開く');
    await app(page, A => { A.editing.title = '検査の昼食（直した）'; A.saveEvent(); });
    r = await app(page, A => A.state.days[0].events.filter(e => /検査の昼食/.test(e.title)).map(e => e.title));
    t.eq(r, ['検査の昼食（直した）'], '編集はその場で差し替わる（二重にならない）');
    await app(page, A => A.undo());
    r = await app(page, A => A.state.days[0].events.filter(e => /検査の昼食/.test(e.title)).map(e => e.title));
    t.eq(r, ['検査の昼食'], '元に戻すで編集前に戻る');
    await app(page, A => A.redo());
    r = await app(page, A => A.state.days[0].events.filter(e => /検査の昼食/.test(e.title)).map(e => e.title));
    t.eq(r, ['検査の昼食（直した）'], 'やり直すで編集後に戻る');
    await app(page, A => { const ev = A.state.days[0].events.find(e => /検査の昼食/.test(e.title)); A.deleteEvent(0, ev); });
    r = await app(page, A => A.state.days[0].events.length);
    t.ok(r === n0, '削除できる', r);
    await app(page, A => A.undo());
    r = await app(page, A => A.state.days[0].events.length);
    t.ok(r === n0 + 1, '削除も元に戻せる', r);

    // ── 編集画面を閉じるとき、書いた内容を黙って捨てない ──
    await app(page, A => { A.openAdd(0); });
    await app(page, A => { A.editing.title = '書きかけ'; A.tryCloseEdit(); });
    r = await app(page, A => ({ editing: !!A.editing, ask: A.discardAsk }));
    t.ok(r.editing && r.ask, '書きかけで閉じると確認が出る', r);
    await app(page, A => A.discardEdit());

    // ── 保存と再読込 ──
    await sleep(400);
    const before = await app(page, A => JSON.stringify(A.state.days.map(d => d.events.map(e => e.title))));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const el = document.querySelector('#app'); return el && el._vnode && el._vnode.component; });
    await sleep(300);
    const after = await app(page, A => JSON.stringify(A.state.days.map(d => d.events.map(e => e.title))));
    t.ok(before === after, '再読込しても中身が同じ');

    // ── 旅程の作成・切り替え・複製 ──
    await app(page, A => A.createNewTrip());
    await sleep(300);
    r = await app(page, A => ({ n: A.tripIndex.length, title: A.state.title, ev: A.state.days[0].events.length }));
    t.ok(r.n === 2 && r.ev === 0, '新しい旅程を作れる', r);
    const firstId = await app(page, A => A.tripIndex[0].id);
    await app(page, (A, id) => A.switchTrip(id), firstId);
    await sleep(300);
    r = await app(page, A => A.state.days.reduce((n, d) => n + d.events.length, 0));
    t.ok(r > 10, '元の旅程へ切り替えられる', r);
    await app(page, (A, id) => A.duplicateTrip(id), firstId);
    await sleep(300);
    r = await app(page, A => A.tripIndex.map(x => x.title));
    t.ok(r.length === 3 && r.some(x => /のコピー$/.test(x)), '旅程を複製できる', r);

    // ── 旅程を切り替えたら、前の旅程の「元に戻す」は効かない（効くと前の旅程の中身で上書きしてしまう） ──
    await app(page, A => A.createNewTrip());
    await sleep(300);
    await app(page, A => { A.openAdd(0); A.editing.title = 'Bの予定'; A.editing.startTime = '10:00'; A.saveEvent(); });
    await app(page, A => { A.undo(); A.undo(); A.undo(); });
    await sleep(400);
    r = await app(page, A => ({ title: A.state.title, n: A.state.days.reduce((n, d) => n + d.events.length, 0), titles: A.tripIndex.map(t => t.title) }));
    t.ok(r.title === '新しい旅程' && r.n === 0, '切り替えたあとの「元に戻す」は今の旅程の中だけで効く', r);
    t.ok(r.titles.filter(x => /さいたま→福岡/.test(x) && !/のコピー/.test(x)).length === 1, 'ほかの旅程の写しができない', r.titles);
    t.ok(!page.errors.length, '操作中にエラーなし', page.errors);
    await page.close();

    // ── 点検：どの旅程でも落ちない／指摘には直す案か手引きがある ──
    for (const [name, data] of [['サンプル', fixture('sample-fes.json')], ['4日×18件', bigTrip(4, 18)], ['14日×8件', bigTrip(14, 8)]]) {
      const p2 = await open(browser, { storage: tripStorage(data) });
      const res = await app(p2, A => {
        const out = { days: 0, issues: 0, noHelp: [], err: '' };
        try {
          A.state.days.forEach((d, i) => {
            const list = A.dayIssues(d, i) || [];
            out.days++;
            out.issues += list.length;
            list.forEach(x => { if (!x.fix && !x.how) out.noHelp.push(x.type + ': ' + x.msg); });
          });
        } catch (e) { out.err = e.message; }
        return out;
      });
      t.ok(!res.err && res.days === data.days.length, `${name}：点検が全日で走る`, res);
      t.ok(!res.noHelp.length, `${name}：指摘にはすべて直す案か手引きがある`, res.noHelp.slice(0, 5));
      t.ok(!p2.errors.length, `${name}：エラーなし`, p2.errors);
      await p2.close();
    }
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
