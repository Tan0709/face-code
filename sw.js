// SW_VERSION 每次发布新版本时将此处改为新数字即可触发更新
const CACHE_NAME = 'face-code-v4';
const ASSETS = ['./face-code-manager.html', './manifest.json', './'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // 立即激活新 SW，不等待旧页面关闭
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // 立即接管所有页面
  self.clients.claim();
});

// 优先网络，失败再走缓存（保证总是拿到最新版本）
self.addEventListener('fetch', e => {
  // 不缓存 Chrome 更新检查等跨域请求
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
