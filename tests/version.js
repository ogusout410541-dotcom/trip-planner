// 版とアップデート履歴
// ・APP_VERSION＝履歴の先頭＝sw.js の CACHE（ずれると、スマホにいつまでも古い版が残る）
// ・履歴の形（新しい順・タグ・日付）
// ・更新後に初めて開いたときだけ「新しくなったこと」が出る／はじめて使う人には出ない
const fs = require('fs');
const path = require('path');
const { launch, open, app, suite, fixture, tripStorage, ROOT } = require('./lib');

(async () => {
  const t = suite('版と履歴');
  const browser = await launch();
  try {
    const page = await open(browser);
    const info = await app(page, A => ({ v: A.APP_VERSION, log: A.CHANGELOG, tags: Object.keys(A.CHANGE_TAGS) }));
    t.ok(info.log[0].v === info.v, '履歴の先頭が今の版', [info.v, info.log[0].v]);
    const sw = fs.existsSync(path.join(ROOT, 'sw.js')) ? fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') : '';
    const swCache = (sw.match(/const CACHE\s*=\s*'([^']*)'/) || [])[1];
    t.ok(swCache === 'trip-v' + info.v, 'sw.js の CACHE が今の版', swCache);
    const sorted = info.log.every((c, i) => i === 0 || page && cmp(info.log[i - 1].v, c.v) > 0);
    t.ok(sorted, '履歴は新しい順');
    t.ok(info.log.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.title && c.items.length), '各版に日付・題名・項目がある');
    t.ok(info.log.every(c => c.items.every(it => info.tags.includes(it[0]) && typeof it[1] === 'string' && it[1].length > 4)), '項目のタグは new/up/fix のどれか');
    await page.close();

    const cases = [
      ['使っていた人が更新後に初めて開く', { ...tripStorage(fixture('sample-fes.json')), trip_seen_version_v1: null }, true],
      ['前の版を見た人', { ...tripStorage(fixture('sample-fes.json')), trip_seen_version_v1: '1.0.0' }, true],
      ['今の版を見た人', { ...tripStorage(fixture('sample-fes.json')), trip_seen_version_v1: info.v }, false],
      ['はじめて使う人', { trip_seen_version_v1: null }, false],
    ];
    for (const [name, storage, want] of cases) {
      const p = await open(browser, { storage });
      const r = await app(p, A => ({ open: A.changelog.open, seen: localStorage.getItem('trip_seen_version_v1') }));
      t.ok(r.open === want, `${name}：新しくなったことが${want ? '出る' : '出ない'}`, r);
      t.ok(r.seen === info.v, `${name}：見た版を覚える`, r);
      if (want) {
        await p.keyboard.press('Escape');
        t.ok(!(await app(p, A => A.changelog.open)), `${name}：Escで閉じる`);
      }
      await p.close();
    }
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();

function cmp(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }
