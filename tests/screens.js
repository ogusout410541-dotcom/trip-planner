// 画面ごとの見た目：主な画面 × 3つの幅 × 明暗で
// ・横にはみ出さない（モーダルが画面幅を超えない）
// ・文字と背景のコントラスト（ふつうの字 4.5、大きい字 3.0）。背景がグラデや画像のところは数えない
const path = require('path');
const { launch, open, app, suite, fixture, tripStorage, sleep, OUT } = require('./lib');

const SCREENS = [
  ['ふだんの画面', () => {}],
  ['設定', A => { A.showSettings = true; }],
  ['旅程の管理', A => { A.showTripPanel = true; }],
  ['予定の編集', A => { A.openEdit(0, A.state.days[0].events[1]); }],
  ['追加メニュー', A => { A.openAddMenu(0); }],
  ['バックアップと書き出し', A => { A.showJsonModal = true; }],
  ['ショートカット', A => { A.showHelp = true; }],
  ['アップデート履歴', A => { A.openChangelog('1.0.0'); }],
  ['スマホで開く', A => { A.openShare(); }],
  ['当日モード', A => { A.openDayMode(); }],
];


function contrastProbe() {
  const lum = (c) => { const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const bgOf = (el) => {
    let layers = [];
    for (let e = el; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      if (st.backgroundImage && st.backgroundImage !== 'none') return null;      // グラデ・画像は判定しない
      const c = parse(st.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
      if (st.backdropFilter && st.backdropFilter !== 'none' && c && c[3] < 0.99) return null;   // すりガラスは下が透ける
    }
    let out = [255, 255, 255];
    for (const c of layers.reverse()) out = out.map((v, i) => v * (1 - c[3]) + c[i] * c[3]);
    return out;
  };
  const bad = [];
  const root = document.querySelector('[data-daymode]') || document.querySelector('[role="dialog"]') || document.querySelector('main');
  root.querySelectorAll('*').forEach(el => {
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join('');
    if (!own) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || Number(st.opacity) < 0.95) return;
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    if (op < 0.95) return;                                                        // わざと薄くしているもの（無効・終わった予定）
    const fg = parse(st.color); const bg = bgOf(el);
    if (!fg || !bg) return;
    const f = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const L1 = lum(f), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(st.fontSize), bold = Number(st.fontWeight) >= 700;
    const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    if (ratio < need) bad.push(`${ratio.toFixed(2)} 「${own.slice(0, 24)}」 ${st.color} on rgb(${bg.map(Math.round).join(',')}) .${String(el.className).slice(0, 40)}`);
  });
  return bad;
}

(async () => {
  const t = suite('画面の見た目');
  const browser = await launch();
  const data = fixture('sample-fes.json');
  try {
    for (const dark of [false, true]) {
      for (const width of [360, 390, 1280]) {
        for (const [name, fn] of SCREENS) {
          const label = `${name}・${width}px・${dark ? '暗' : '明'}`;
          const page = await open(browser, { width, height: 800, mobile: width < 600, dark, now: '2026-09-19T07:30:00', storage: { ...tripStorage(data), trip_day_ask_v1: '2026-09-19' } });
          await app(page, fn);
          await sleep(350);
          const r = await page.evaluate(() => {
            const W = innerWidth;
            const dlg = document.querySelector('[data-daymode]') || [...document.querySelectorAll('[role="dialog"]')].pop();
            const inner = dlg ? (dlg.querySelector('.modal-inner, .glass, .relative') || dlg) : null;
            const ib = inner ? inner.getBoundingClientRect() : null;
            const over = [...(dlg || document.body).querySelectorAll('*')].filter(el => {
              const b = el.getBoundingClientRect();
              if (!b.width || b.right <= W + 1) return false;
              for (let e = el.parentElement; e; e = e.parentElement) { const ox = getComputedStyle(e).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false; }
              return true;
            }).map(el => (el.className.toString() || el.tagName).slice(0, 50));
            return { sw: document.documentElement.scrollWidth, W, inner: ib && [Math.round(ib.left), Math.round(ib.right)], over: over.slice(0, 4) };
          });
          t.ok(r.sw <= r.W && !r.over.length && (!r.inner || (r.inner[0] >= -1 && r.inner[1] <= r.W + 1)), `${label}：はみ出さない`, r);
          const bad = await page.evaluate(contrastProbe);
          t.ok(!bad.length, `${label}：文字が背景に沈まない`, bad.slice(0, 5));
          t.ok(!page.errors.length, `${label}：エラーなし`, page.errors);
          if (width === 390 && ['スマホで開く', '設定', 'ふだんの画面', '予定の編集'].includes(name)) await page.screenshot({ path: path.join(OUT, `screen_${name}_${dark ? 'dark' : 'light'}.png`) });
          await page.close();
        }
      }
    }
  } catch (e) { t.ok(false, '例外なく最後まで走る', e.stack); }
  await browser.close();
  t.done();
})();
