const CACHE_NAME = 'scoa-master-v4'; // バージョンを更新
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// 初回インストール時
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// 古いバージョンのキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// ★ Stale-While-Revalidate 戦略 ★
// ① キャッシュがあれば即座（0秒）に画面に返す
// ② 同時に裏でネットワークから最新版を取得し、キャッシュを更新する
self.addEventListener('fetch', event => {
  // 外部API（FirebaseやGemini）は除外
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        // バックグラウンドで最新を取得・更新
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(err => {
          // オフライン等でフェッチ失敗した場合は無視（キャッシュが返るため問題なし）
          console.log("Offline mode: Fetch failed, using cache.");
        });

        // キャッシュがあれば即座に返し、初回などキャッシュが無ければフェッチ完了を待つ
        return cachedResponse || fetchPromise;
      });
    })
  );
});
