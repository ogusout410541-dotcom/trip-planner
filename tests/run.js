// 全部まわす：node tests/run.js        一部だけ：node tests/run.js print flow
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');

const ALL = fs.readdirSync(__dirname).filter(f => /^[a-z][\w-]*\.js$/.test(f) && !['run.js', 'lib.js'].includes(f)).map(f => f.replace(/\.js$/, ''));
const pick = process.argv.slice(2);
const list = pick.length ? ALL.filter(n => pick.includes(n)) : ALL;

(async () => {
  const t0 = Date.now();
  let pass = 0, fail = 0;
  const bad = [];
  for (const name of list) {
    const res = await new Promise((resolve) => {
      let got = null;
      const cp = fork(path.join(__dirname, name + '.js'), [], { cwd: __dirname });
      cp.on('message', m => { got = m; });
      cp.on('exit', code => resolve(got || { name, pass: 0, fail: 1, fails: [`終了コード ${code}（途中で止まった）`] }));
    });
    pass += res.pass; fail += res.fail;
    if (res.fail) bad.push(name);
  }
  console.log(`\n${fail ? 'NG' : 'OK'}  合計 ${pass}/${pass + fail}（${list.length}本・${Math.round((Date.now() - t0) / 1000)}秒）${bad.length ? '　失敗：' + bad.join(', ') : ''}`);
  process.exitCode = fail ? 1 : 0;
})();
