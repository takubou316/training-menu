// 通知実験専用のサービスワーカー(Compstack本体のservice-worker.jsとは別物、scopeはこのフォルダだけ)。
// プッシュを受け取ったら必ず通知を出す(iPhoneは通知を出さないプッシュが続くと受け取りを止めるため)。
// 届いた時刻を記録して、ページ側で「送ってから何秒で届いたか」を見られるようにする。
const LOG_CACHE = 'push-exp-log';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const receivedAt = Date.now();
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data && event.data.text() }; }
  const id = data.id || String(receivedAt);
  const entry = { id, label: data.label || '', sentAt: data.sentAt || null, receivedAt };
  event.waitUntil(Promise.all([
    caches.open(LOG_CACHE).then((cache) => cache.put(`log/${receivedAt}`, new Response(JSON.stringify(entry)))),
    self.registration.showNotification(data.title || '通知実験', {
      body: data.body || 'プッシュ通知が届きました',
      tag: id,
      icon: '../../icons/icon-192.png',
      data: { id },
    }),
  ]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(`./index.html?opened=${encodeURIComponent(event.notification.data.id)}`, self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const client = list.find((c) => c.url.startsWith(self.registration.scope));
    if (client) return client.focus().then((c) => c && c.navigate ? c.navigate(url) : c);
    return self.clients.openWindow(url);
  }));
});
