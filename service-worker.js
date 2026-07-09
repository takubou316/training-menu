// 静的アセットのみをオフラインキャッシュする。バックエンドAPIは持たないため素通し対象はない。

const CACHE_NAME = 'training-menu-v7';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/exercises-data.js',
  './js/rules.js',
  './js/menu-generator.js',
  './js/storage.js',
  './js/workout-log.js',
  './js/ui.js',
  './js/session-timer.js',
  './js/hold-timer.js',
  './js/rest-timer.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // ネットワーク優先: オンライン時は常に最新のコードを取得し、取れた分だけキャッシュを更新する。
  // オフライン時のみキャッシュにフォールバックする。
  // cache: 'no-store' が必須: 指定しないとブラウザの通常HTTPキャッシュ(GitHub Pagesの
  // Cache-Control: max-age=600)がそのまま使われてしまい、pushしても最大10分は
  // 古いコードが表示され続けるバグがあった。
  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
