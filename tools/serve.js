// ローカル確認用の配信サーバー（GitHub Pages と同じく素のファイルを返すだけ）
//   node tools/serve.js [port]   … 既定 7835
// tests/lib.js からも使う（start(port) が { url, close } を返す）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8',
};

function start(port = 0, opts = {}) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        // GitHub Pages と同じ寿命。SW がこれを避けて取り込めるかを試すため
        'Cache-Control': opts.maxAge != null ? `max-age=${opts.maxAge}` : 'max-age=600',
      });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}/`;
      resolve({ url, close: () => new Promise(r => server.close(r)) });
    });
  });
}

module.exports = { start, ROOT };

if (require.main === module) {
  const port = Number(process.argv[2]) || 7835;
  start(port).then(s => console.log('旅程プランナー: ' + s.url));
}
