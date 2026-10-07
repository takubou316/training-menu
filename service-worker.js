// 静的アセットのみをオフラインキャッシュする。バックエンドAPIは持たないため素通し対象はない。

// js/app.jsのAPP_VERSIONと必ず同じ番号にする(「その他の設定」のバージョン表示で比べる)
const CACHE_NAME = 'training-menu-v60';
// index.htmlで読み込むローカルファイルはすべてここに入れること（漏れるとオフライン起動に失敗する）。
// 動画(media/)は容量が大きくRangeリクエストとも相性が悪いため対象外。
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './assets/stamp-record.svg',
  './js/exercises-data.js',
  './js/knowledge-data.js',
  './js/rules.js',
  './js/menu-generator.js',
  './js/storage.js',
  './js/workout-log.js',
  './js/ui.js',
  './js/session-timer.js',
  './js/hold-timer.js',
  './js/cardio-timer.js',
  './js/rest-timer.js',
  './js/sync.js',
  './js/push.js',
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
        // 404/500等のエラー応答で正常なキャッシュを上書きしない。CDNのスクリプト(supabase)は
        // no-corsで読まれ中身が見えない(opaque)応答になるため、それは従来どおり保存する。
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

// ===== 有酸素の目標時間のプッシュ通知（2026-10-07〜、送る側はjs/push.jsとsupabase/functions） =====
// iPhoneは、プッシュを受け取ったのに通知を出さないことが続くと受け取りを止めるため、必ず通知を出す。
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || '目標時間になりました', {
    body: data.body || '',
    // 種類ごとのtag(有酸素の目標時間/予定の時刻、2026-10-07〜はサーバーが送る)。同じtagの通知は上書き表示になる
    tag: data.tag || 'cardio-target',
    icon: 'icons/icon-192.png',
  }));
});

// 通知を押したら、開いているCompstackを前に出す(無ければ開く)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const client = list.find((c) => c.url.startsWith(self.registration.scope));
    if (client) return client.focus();
    return self.clients.openWindow(new URL('./index.html', self.registration.scope).href);
  }));
});
