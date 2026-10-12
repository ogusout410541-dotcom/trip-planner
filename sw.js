// 旅程プランナーのオフライン用 Service Worker
// ・https で開いたときだけ登録する（localhost / file:// では使わない。index.html の registerSW を参照）
// ・リリースのたびに CACHE を index.html の APP_VERSION と同じ番号に上げる（上げないとスマホに古い版が残る）
const CACHE = 'trip-v1.4.1';
const FONT_CACHE = 'trip-fonts';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'vendor/vue.global.prod.js',
  'vendor/tailwindcss-play-3.4.17.js',
  'vendor/qr.js',
  'vendor/fontawesome/css/all.min.css',
  'vendor/fontawesome/webfonts/fa-solid-900.woff2',
  'vendor/fontawesome/webfonts/fa-regular-400.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

// GitHub Pages は max-age=600 を返すので、ふつうに取り込むと新しい版のキャッシュに古いファイルが入る。
// cache:'reload' ＋ ?v= でブラウザのキャッシュを避けて取り、元の URL で入れる（クルナビで実際に詰まった件）
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(async (path) => {
      const url = new URL(path, self.registration.scope);
      const fresh = new URL(url); fresh.searchParams.set('v', CACHE);
      const res = await fetch(new Request(fresh, { cache: 'reload' }));
      if (!res.ok) throw new Error(path + ' ' + res.status);
      await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 本体：キャッシュにあればそれを使う（差し替えは install にまかせる。1つずつ裏で更新すると新旧が混ざる）
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const key = req.mode === 'navigate' ? new URL('index.html', self.registration.scope) : new URL(url.origin + url.pathname);
      const hit = await cache.match(key);
      if (hit) return hit;
      try { return await fetch(req); }
      catch { return (await cache.match(new URL('index.html', self.registration.scope))) || Response.error(); }
    })());
    return;
  }

  // 文字（Google Fonts）：手元にあれば先に返し、裏で取り直す。圏外ではあるものだけで描く
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
  // それ以外（駅データ・地図・時刻表）はアプリ側が自分で控えを持つので、ここでは触らない
});

// 画面から「いまどの版が入っているか」を聞けるように
self.addEventListener('message', (event) => {
  if (event.data === 'status') {
    caches.open(CACHE).then(c => c.keys()).then(keys => {
      event.source.postMessage({ type: 'status', cache: CACHE, count: keys.length });
    });
  }
});
