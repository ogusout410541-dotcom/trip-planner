// テンプレートの検査（ブラウザ不要）
// ・構文エラーが無いこと
// ・テンプレートが使う名前が setup の return に全部あること
//   compile() の既定は with(_ctx) なので素の識別子を見逃す（MOVE_TYPES で実際に踏んだ）。
//   prefixIdentifiers:true でもう一度コンパイルして _ctx.名前 を洗い出す
const fs = require('fs');
const path = require('path');
const { compile } = require('@vue/compiler-dom');
const { suite, ROOT } = require('./lib');

const t = suite('テンプレート');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const a = html.indexOf('  template: `');
const b = html.lastIndexOf('`,\n}).mount(');
t.ok(a > 0 && b > a, 'テンプレートの位置が分かる');
const raw = html.slice(a + '  template: `'.length, b);
let tpl = '';
try { tpl = new Function('return `' + raw + '`')(); t.ok(true, 'テンプレート文字列として評価できる'); }
catch (e) { t.ok(false, 'テンプレート文字列として評価できる', e.message); }

const errors = [];
let code = '';
try {
  code = compile(tpl, { mode: 'module', prefixIdentifiers: true, hoistStatic: false, onError: e => errors.push(e.message + ' @' + (e.loc && e.loc.start.line)) }).code;
} catch (e) { errors.push(e.message); }
t.ok(!errors.length, 'コンパイルエラーなし', errors.slice(0, 5));

const ret = html.slice(html.indexOf('    return {\n      state,'), html.indexOf('\n    };\n  },\n\n  template:'));
const exposed = new Set();
ret.replace(/\/\*[\s\S]*?\*\//g, '').split(/[,\n{}]/).forEach(part => {
  const m = part.trim().match(/^([A-Za-z_$][\w$]*)(\s*:\s*[A-Za-z_$][\w$]*)?$/);
  if (m) exposed.add(m[1]);
});
t.ok(exposed.size > 300, '公開名を読み取れる', exposed.size);

const used = new Set();
code.replace(/_ctx\.([A-Za-z_$][\w$]*)/g, (_, n) => used.add(n));
const missing = [...used].filter(n => !exposed.has(n));
t.ok(!missing.length, 'テンプレートが使う名前はすべて公開されている', missing);

// v-for に :key が付いているか（並べ替え・削除で入力欄の中身が入れ替わる事故を防ぐ）
const vfor = tpl.match(/<[^>]*\sv-for="[^"]*"[^>]*>/g) || [];
const noKey = vfor.filter(tag => !/\s:key="/.test(tag) && !/^<template/.test(tag));
t.ok(!noKey.length, 'v-for にはすべて :key がある', noKey.slice(0, 3));

t.done();
