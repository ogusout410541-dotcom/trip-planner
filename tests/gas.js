// GAS 側（gas/コード.gs）の検査：本物のコードを偽の Google サービスの上で動かす
const { makeGas } = require('./_gas_fake');
const { suite } = require('./lib');

const t = suite('GAS');
const g = makeGas();
const get = (p) => JSON.parse(g.ctx.doGet({ parameter: p }).s);
const post = (b) => JSON.parse(g.ctx.doPost({ postData: { contents: typeof b === 'string' ? b : JSON.stringify(b) } }).s);
const K = 'a'.repeat(32), K2 = 'b'.repeat(32);

t.ok(get({}).error === 'key' && get({ k: 'xyz' }).error === 'key', '合言葉のハッシュでない鍵は断る');
t.ok(get({ k: K, op: 'ping' }).ok, '接続の確認に答える');
let r = get({ k: K });
t.ok(r.ok && r.updated === 0 && r.data === '', 'まだ何もない置き場は空で返す', r);
t.ok(post('{oops').error === 'json', '壊れた JSON は断る');
t.ok(post({ k: K, data: '<script>' }).error === 'data', 'アプリが作る形でないデータは断る');
t.ok(post({ k: K, data: 'z' + 'A'.repeat(10) + '=' }).error === 'data', '記号の混ざったデータは断る');
r = post({ k: K, base: 0, data: 'zAAAA', device: 'PC' });
t.ok(r.ok && r.updated > 0, '保存できる', r);
const u1 = r.updated;
r = get({ k: K });
t.ok(r.data === 'zAAAA' && r.updated === u1 && r.device === 'PC', '保存したものを読み出せる', r);
r = post({ k: K, base: 123, data: 'zBBBB' });
t.ok(!r.ok && r.conflict && r.data === 'zAAAA', '別の端末が先に保存していたら、競合として今の中身を返す', r);
t.ok(get({ k: K }).data === 'zAAAA', '競合したときは上書きしない');
t.ok(get({ k: K2 }).data === '', '合言葉が違えば別の置き場');

// 過去の版：1日1つ、30日ぶん
const snaps = () => [...g.files.keys()].filter(n => /^trip_a+_\d{8}\.json$/.test(n)).sort();
let base = get({ k: K }).updated;
r = post({ k: K, base, data: 'zCCCC' });
t.ok(snaps().length === 1 && JSON.parse(g.files.get(snaps()[0]).content).data === 'zAAAA', '上書きする前の版を、その日の控えとして残す', snaps());
base = r.updated;
r = post({ k: K, base, data: 'zDDDD' });
t.ok(snaps().length === 1, '同じ日の控えは1つだけ', snaps());
for (let d = 1; d <= 35; d++) {
  g.setDay('202611' + String(d).padStart(2, '0'));
  base = get({ k: K }).updated;
  post({ k: K, base, data: 'zE' + d });
}
const s = snaps();
t.ok(s.length === 30 && s[s.length - 1] === 'trip_' + K + '_20261135.json', '控えは新しいほうから30日ぶん', [s.length, s[0], s[s.length - 1]]);
t.ok(post({ k: K, data: 'z' + 'A'.repeat(5000001) }).error === 'large', '大きすぎるものは断る');
t.done();
