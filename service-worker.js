// 静的アセットのみをオフラインキャッシュする。バックエンドAPIは持たないため素通し対象はない。

const CACHE_NAME = 'training-menu-v2';
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
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
