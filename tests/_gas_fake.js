// 偽の GAS：本物の gas/コード.gs を node の中で動かし、Google のサービスだけ偽物にして HTTP で答える
//   const g = await startGas();  g.url（…/macros/s/TEST/exec）／ g.files（ドライブの中身）／ g.setDay('20261013')／ g.close()
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

function makeGas() {
  const files = new Map();     // 名前 → { content, trashed }
  let day = '20261012';
  const fileObj = (name) => ({
    getName: () => name,
    getBlob: () => ({ getDataAsString: () => files.get(name).content }),
    setContent: (c) => { files.get(name).content = String(c); },
    setTrashed: (t) => { if (t) files.delete(name); },
  });
  const iter = (list) => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const folder = {
    getFilesByName: (n) => iter(files.has(n) ? [fileObj(n)] : []),
    getFiles: () => iter([...files.keys()].map(fileObj)),
    createFile: (n, c) => { files.set(n, { content: String(c) }); return fileObj(n); },
  };
  let folderMade = false;
  const ctx = {
    DriveApp: {
      getFoldersByName: () => iter(folderMade ? [folder] : []),
      createFolder: () => { folderMade = true; return folder; },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    MimeType: { PLAIN_TEXT: 'text/plain' },
    Utilities: { formatDate: () => day },
    JSON, Date, Number, String, RegExp, Array, Object,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'gas', 'コード.gs'), 'utf8'), ctx);
  return { ctx, files, setDay: (d) => { day = d; } };
}

function startGas() {
  const g = makeGas();
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
      res.end(body);
    };
    if (u.pathname !== '/macros/s/TEST/exec') return send(404, 'not found', 'text/html');
    if (g.down) return send(503, 'down', 'text/html');
    if (req.method === 'GET') {
      const out = g.ctx.doGet({ parameter: Object.fromEntries(u.searchParams) });
      return send(200, out.s);
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      g.posts = (g.posts || 0) + 1;
      const out = g.ctx.doPost({ postData: { contents: body } });
      send(200, out.s);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve(Object.assign(g, { base, url: base + '/macros/s/TEST/exec', close: () => new Promise(r => server.close(r)) }));
  }));
}

module.exports = { makeGas, startGas };
