// 印刷の検査：割り付けの見積り（printPages）と、実際に PDF にしたときの枚数が一致すること。
// 白紙（中身の無い紙）が出ないこと。横・縦の両方で。
const fs = require('fs');
const path = require('path');
const { launch, open, app, suite, fixture, tripStorage, sleep, OUT } = require('./lib');
const { bigTrip } = require('./fixtures/gen');

function pdfPages(buf) {
  const s = buf.toString('latin1');
  return (s.match(/\/Type\s*\/Page[^s]/g) || []).length;
}

(async () => {
  const t = suite('印刷');
  const browser = await launch();
  const trips = [
    ['サンプル', fixture('sample-fes.json')],
    ['4日×18件', bigTrip(4, 18)],
    ['14日×8件', bigTrip(14, 8)],
    ['1日×40件', bigTrip(1, 40)],
  ];
  for (const [name, data] of trips) {
    for (const orient of ['landscape', 'portrait']) {
      const label = `${name}・${orient === 'landscape' ? '横' : '縦'}`;
      let page;
      try {
        page = await open(browser, { storage: { ...tripStorage(data), trip_print_opts_v1: { orient } } });
        const plan = await app(page, async (A, o) => {
          A.printOpts.orient = o;
          await A.planPrint();
          return { pages: A.printPages.length, empty: A.printPages.filter(p => !p.cols.some(c => c.length)).length };
        }, orient);
        await sleep(100);
        await page.emulateMediaType('print');
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        const n = pdfPages(Buffer.from(pdf));
        if (name === '4日×18件') fs.writeFileSync(path.join(OUT, `print_${orient}.pdf`), pdf);
        t.ok(!page.errors.length, `${label}：エラーなし`, page.errors);
        t.ok(plan.pages >= 1 && plan.empty === 0, `${label}：見積りに白紙が無い`, plan);
        t.ok(n === plan.pages, `${label}：見積り＝実際の枚数`, { 見積り: plan.pages, 実際: n });
      } catch (e) { t.ok(false, `${label}：例外なし`, e.message); }
      if (page) await page.close();
    }
  }
  await browser.close();
  t.done();
})();
