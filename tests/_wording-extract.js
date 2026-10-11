// 画面に出る文言を抜き出す（文言の点検用。node tests/_wording-extract.js > tests/out/wording.txt）
// テンプレートの文字・title/aria-label/placeholder、JS の flash()・msg/how/label の文字列
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const lines = html.split('\n');
const out = [];
const jp = /[぀-ヿ一-鿿]/;
const tplStart = lines.findIndex(l => l.startsWith('  template: `'));
lines.forEach((l, i) => {
  const n = i + 1;
  if (i > tplStart) {
    // テンプレート：タグの外の文字と、属性の文字
    const text = l.replace(/<[^>]*>/g, '\u0001').split('\u0001').map(x => x.trim()).filter(x => jp.test(x) && !/^<!--/.test(x));
    text.forEach(x => out.push(`${n}\tT\t${x}`));
    (l.match(/(?:title|aria-label|placeholder)="[^"]*"/g) || []).forEach(a => { if (jp.test(a)) out.push(`${n}\tA\t${a}`); });
  } else {
    if (/^\s*(\/\/|\/\*|\*)/.test(l)) return;
    // JS：flash('…')、msg/how/label/detail: '…' / `…`
    (l.match(/(?:flash|confirm)\(\s*(['`])(?:(?!\1).)*\1/g) || []).forEach(m => out.push(`${n}\tF\t${m}`));
    (l.match(/\b(?:msg|how|label|detail|title|desc|lead)\s*:\s*(['`])(?:(?!\1).)*\1/g) || []).forEach(m => { if (jp.test(m)) out.push(`${n}\tJ\t${m}`); });
  }
});
console.log(out.join('\n'));
