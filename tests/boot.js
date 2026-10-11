// 起動の検査：空の状態・サンプル旅程の両方で、3つの幅×明暗で
// ・実行時エラーが出ないこと  ・横にはみ出さないこと  ・見出しと本文が描かれること
const { launch, open, app, suite, fixture, tripStorage, OUT } = require('./lib');
const path = require('path');

(async () => {
  const t = suite('起動');
  const browser = await launch();
  try {
    const sample = fixture('sample-fes.json');
    for (const kind of ['空', 'サンプル']) {
      for (const width of [390, 768, 1280]) {
        for (const dark of [false, true]) {
          const label = `${kind}・${width}px・${dark ? '暗' : '明'}`;
          const page = await open(browser, { width, dark, storage: kind === 'サンプル' ? tripStorage(sample) : {} });
          const info = await page.evaluate(() => ({
            sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
            header: !!document.querySelector('header') && document.querySelector('header').getBoundingClientRect().height > 20,
            text: document.body.innerText.length,
            darkClass: document.body.classList.contains('dark'),
          }));
          t.ok(!page.errors.length, `${label}：エラーなし`, page.errors);
          t.ok(info.sw <= info.cw, `${label}：横にはみ出さない`, info);
          t.ok(info.header && info.text > 50, `${label}：描画される`, info);
          t.ok(info.darkClass === dark, `${label}：配色が設定どおり`, info);
          if (kind === 'サンプル') {
            const n = await app(page, A => A.state.days.reduce((n, d) => n + d.events.length, 0));
            t.ok(n === sample.days.reduce((n, d) => n + d.events.length, 0), `${label}：予定がすべて読み込まれる`, n);
          }
          if (width === 390 && kind === 'サンプル') await page.screenshot({ path: path.join(OUT, `boot_${width}_${dark ? 'dark' : 'light'}.png`) });
          await page.close();
        }
      }
    }
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
