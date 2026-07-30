// SW_VERSION 每次发布新版本时将此处改为新数字即可触发更新
const CACHE_NAME = 'face-code-v20';
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
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
    // 强制刷新所有受控页面，确保立刻拿到新内容。
    // 这能打破“旧 SW 缓存旧 HTML、且自检测版本永远等于最新不发刷新”的僵局。
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of clients) {
      try { await c.navigate(c.url); } catch (_) { /* 忽略个别浏览器不支持的情况 */ }
    }
  })());
});

// 优先网络，失败再走缓存；HTML 页面强制每次向网络取最新，避免旧 SW 卡住旧版
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.location.origin)) return;
  const url = new URL(e.request.url);
  const isHtml = e.request.mode === 'navigate'
    || url.pathname.endsWith('/face-code-manager.html')
    || url.pathname.endsWith('/index.html')
    || url.pathname === '/' || url.pathname.endsWith('/');
  if (isHtml) {
    // HTML 直接走网络取最新，失败才回退缓存。
    // 注意：不再对 HTML 的 Response 做 clone/缓存（运行时），
    // 因为对导航/HTML 响应克隆后缓存会触发 "Response body is already used" 异常，
    // 导致更新失败并一直 fallback 到旧缓存。离线兜底由 install 时的 ASSETS 提供。
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then(async r => {
        if (r.ok) {
          // 静态资源：网络优先，成功后更新缓存。await 确保 put 完成，降低并发竞态
          const clone = r.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(e.request, clone);
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
