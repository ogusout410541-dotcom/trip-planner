// スマホで作業するときの点検（診断用。node tests/_mobile-audit.js）
// 390×844・タッチ操作で主な画面を開き、押しにくいもの・拡大を招く入力欄・埋もれた保存ボタンなどを数える
const path = require('path');
const { launch, open, app, fixture, tripStorage, sleep, OUT } = require('./lib');

const SCREENS = [
  ['ふだんの画面', () => null],
  ['予定の編集（電車）', A => { A.openEdit(0, A.state.days[0].events[1]); return null; }],
  ['予定の追加', A => { A.openAdd(0); return null; }],
  ['追加メニュー', A => { A.openAddMenu(0); return null; }],
  ['移動を追加', A => { A.openMoveWizard(0, 0); return null; }],
  ['ここから次へ', A => { A.openNextWizard(0, A.state.days[0].events.length - 1); return null; }],
  ['列車を選ぶ', A => { A.openTrainWizardNew(0); return null; }],
  ['直し方', A => { const id = Object.keys(A.issueLevelById)[0]; const di = A.state.days.findIndex(d => d.events.some(e => e.id === id)); if (di >= 0) A.openFixDialog(di, A.state.days[di].events.find(e => e.id === id)); return null; }],
  ['旅程の管理', A => { A.showTripPanel = true; return null; }],
  ['設定', A => { A.showSettings = true; return null; }],
  ['検索', A => { A.openSearch(); return null; }],
  ['当日モード', A => { A.openDayMode(); return null; }],
];

function probe() {
  const H = innerHeight;
  const dlg = document.querySelector('[data-daymode]') || [...document.querySelectorAll('[role="dialog"]')].pop() || document.querySelector('main');
  const vis = (el) => { const b = el.getBoundingClientRect(); const st = getComputedStyle(el); return b.width > 0 && b.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
  const label = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 18);
  const targets = [...dlg.querySelectorAll('button, a[href], input, select, textarea, summary')].filter(vis).filter(el => el.type !== 'checkbox' && el.type !== 'radio' && !(el.tagName === 'INPUT' && el.type === 'file'));
  const size = (el) => el.getBoundingClientRect();
  const small = targets.filter(el => { const b = size(el); return b.height < 32 || b.width < 32; });
  const mid = targets.filter(el => { const b = size(el); return (b.height < 44 || b.width < 44) && !(b.height < 32 || b.width < 32); });
  const inputs = [...dlg.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea')].filter(vis);
  const zoom = inputs.filter(el => parseFloat(getComputedStyle(el).fontSize) < 16);
  const hidden = [...dlg.querySelectorAll('button')].filter(el => { const b = el.getBoundingClientRect(); let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); return b.width && op < 0.3; });
  const primary = [...dlg.querySelectorAll('button')].filter(vis).find(b => /^(保存|この内容で|つないで|完了|これで|作る|追加する)/.test(b.textContent.trim()));
  const pb = primary ? primary.getBoundingClientRect() : null;
  const panel = dlg.querySelector('.modal-inner') || dlg;
  return {
    targets: targets.length, small: small.length, smallEx: small.slice(0, 10).map(el => { const b = size(el); return `${label(el)}(${Math.round(b.width)}×${Math.round(b.height)})`; }),
    mid: mid.length, zoom: zoom.length, zoomEx: zoom.slice(0, 4).map(el => `${label(el)}:${getComputedStyle(el).fontSize}`),
    hidden: hidden.length, hiddenEx: hidden.slice(0, 4).map(label),
    primary: primary ? { text: label(primary), top: Math.round(pb.top), visible: pb.top >= 0 && pb.bottom <= H } : null,
    panelH: Math.round(panel.scrollHeight), viewH: H,
  };
}

function print(n, r) {
  console.log(`\n■ ${n}  押せるもの${r.targets}  小さい(<32px)${r.small}  やや小さい(<44px)${r.mid}  拡大を招く入力欄${r.zoom}  見えないボタン${r.hidden}  中身の高さ${r.panelH}/${r.viewH}`);
  if (r.small) console.log('   小さい: ' + r.smallEx.join(' / '));
  if (r.zoom) console.log('   拡大: ' + r.zoomEx.join(' / '));
  if (r.hidden) console.log('   見えない: ' + r.hiddenEx.join(' / '));
  if (r.primary) console.log(`   決定ボタン「${r.primary.text}」 開いた直後に${r.primary.visible ? '見えている' : '見えない（' + r.primary.top + 'px の位置）'}`);
}

(async () => {
  const browser = await launch();
  const data = fixture('sample-fes.json');
  for (const [name, fn] of SCREENS) {
    const page = await open(browser, { width: 390, height: 844, mobile: true, now: '2026-09-19T07:30:00', storage: { ...tripStorage(data), trip_day_ask_v1: '2026-09-19' } });
    page.on('dialog', d => d.dismiss());
    await Promise.race([app(page, fn).catch(e => console.log(name, 'ERR', e.message)), sleep(5000)]);
    await sleep(450);
    const r = await Promise.race([page.evaluate(probe), sleep(8000).then(() => null)]);
    if (r) print(name, r); else console.log(name, '…測れませんでした');
    await page.screenshot({ path: path.join(OUT, `mobile_${name}.png`) }).catch(() => {});
    await page.close();
  }
  const page = await open(browser, { width: 390, height: 844, mobile: true, storage: tripStorage(data) });
  const ins = await page.evaluate(() => { const b = document.querySelector('.ins-row button'); if (!b) return null; let op = 1; for (let e = b; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity); return { opacity: op, h: Math.round(b.getBoundingClientRect().height) }; });
  await app(page, A => { A.openEdit(0, A.state.days[0].events[1]); return null; });
  await sleep(300);
  const lock = await page.evaluate(() => ({ body: getComputedStyle(document.body).overflow, overscroll: getComputedStyle(document.querySelector('[data-modal="edit"] .modal-inner')).overscrollBehaviorY, maxH: getComputedStyle(document.querySelector('[data-modal="edit"] .modal-inner')).maxHeight }));
  console.log('\n背景のスクロール止め', JSON.stringify(lock));
  console.log('あいだに追加のボタン', JSON.stringify(ins));
  await page.close();
  await browser.close();
  process.exit(0);
})();
