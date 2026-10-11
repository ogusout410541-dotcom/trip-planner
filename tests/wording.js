// 画面の文言の見張り（ブラウザ不要）
// 使わないと決めた言葉・表記のゆれ・絵文字が、画面に出る文字列に入り込んでいないか
const { execFileSync } = require('child_process');
const path = require('path');
const { suite } = require('./lib');

const t = suite('文言');
const rows = execFileSync(process.execPath, [path.join(__dirname, '_wording-extract.js')], { encoding: 'utf8' })
  .split('\n').filter(Boolean).map(l => { const [line, kind, text] = l.split('\t'); return { line, kind, text }; })
  // テンプレート内の HTML コメントは画面に出ない
  .filter(r => !/^<!--|-->$/.test(r.text));
t.ok(rows.length > 900, '文言を抜き出せる', rows.length);

const BANNED = [
  [/トースト|エディタ|テキストエリア/, '開発者の言葉（トースト・エディタ・テキストエリア）'],
  [/えらぶ|えらび|えらん/, '「えらぶ」は「選ぶ」に統一'],
  [/題名/, '「題名」は「タイトル」に統一'],
  [/開始時間|終了時間/, 'その時点を指すときは「時刻」'],
  [/重複/, '時間の重なりは「重なり」'],
  [/要確認/, '点検の段は「要修正・注意・気づき」'],
  [/乗り継/, '「乗り継ぐ」は「乗り換える」に統一'],
  [/未払い/, '払っていないぶんは「当日」'],
  [/\(¥\)/, '通貨は「（円）」'],
  [/として使います|伏せています|表示されます/, '機械が報告するような言い方'],
  [/下限を変えられます|カラム/, 'もう無い設定の説明'],
];
for (const [re, why] of BANNED) {
  const hit = rows.filter(r => re.test(r.text));
  t.ok(!hit.length, why, hit.slice(0, 4).map(r => `${r.line}: ${r.text.slice(0, 80)}`));
}
const emoji = rows.filter(r => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(r.text.replace(/[⇄→↓←▸▾⋯★☆✓]/g, '')));
t.ok(!emoji.length, '画面に絵文字を使わない（アイコンは Font Awesome）', emoji.slice(0, 4).map(r => `${r.line}: ${r.text.slice(0, 60)}`));
t.done();
