// SW_VERSION 每次发布新版本时将此处改为新数字即可触发更新
const CACHE_NAME = 'face-code-v5';
const ASSETS = ['./face-code-manager.html', './manifest.json', './'];

const PAGE_VERSION_KEY = 'page_version';
let currentPageVersion = null;

// 读取页面内的版本标记（注入到 window）
async function fetchPageVersion() {
  try {
    const resp = await fetch('./face-code-manager.html?t=' + Date.now());
    if (!resp.ok) return null;
    const text = await resp.text();
    const match = text.match(/const PAGE_VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 优先网络，失败再走缓存
self.addEventListener('fetch', e => {
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

// 定期检查页面版本，发现新版本则通知所有客户端刷新
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'GET_VERSION') {
    // 客户端询问当前已知版本
    e.ports[0].postMessage({ pageVersion: currentPageVersion });
  }
});

// 初始化：读取页面版本
fetchPageVersion().then(v => {
  currentPageVersion = v;
});

// 每 30 秒检查一次新版本
setInterval(async () => {
  const newVersion = await fetchPageVersion();
  if (!newVersion || !currentPageVersion) return;
  if (newVersion !== currentPageVersion) {
    currentPageVersion = newVersion;
    // 通知所有标签页刷新
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      client.postMessage({ type: 'RELOAD_PAGE', newVersion });
    });
  }
}, 30000);
