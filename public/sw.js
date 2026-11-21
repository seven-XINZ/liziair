/**
 * LIZI · Service Worker
 * ------------------------------------------------------------------
 * 设计原则：**绝不挡开发流、绝不碰音频与接口**
 *  · /api/* 一律直连网络（音频流、搜索、歌词都是动态的，缓存只会出错）
 *  · 带 Range 的请求直接放行（拖进度条必须到服务端）
 *  · 页面与 js/css 走"网络优先"：改完刷新立即生效，断网才回退缓存
 *  · 图标/字体/图片走"缓存优先"：这些基本不变，省流量
 * 只做到"可安装 + 断网有壳"，不做激进离线，避免把旧代码钉在用户手机上。
 */
const VERSION = 'lizi-pwa-v2';
const SHELL = ['/', '/manifest.webmanifest', '/assets/icons/icon-192.png', '/assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // 逐个加，单个失败不拖垮整体安装
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const CACHE_FIRST = /\.(png|jpe?g|gif|webp|avif|ico|svg|woff2?|ttf|otf)$/i;
/* 图片/字体缓存上限：手机存储有限，攒到几百条就淘汰最早的一批，
   避免用户逛久了把缓存撑到几百 MB。 */
const CACHE_MAX_ENTRIES = 320;
const CACHE_MAX_BYTES = 3 * 1024 * 1024;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // 第三方（字体 CDN 等）不接管
  if (url.pathname.startsWith('/api/')) return;             // 接口与音频：永远直连
  if (req.headers.has('range')) return;                     // 分段请求：永远直连
  if (req.mode === 'navigate' && url.searchParams.has('no-sw')) return;

  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith((async () => {
      const c = await caches.open(VERSION);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') {
          const len = Number(res.headers.get('content-length') || 0);
          if (!len || len <= CACHE_MAX_BYTES) {
            const keys = await c.keys();
            if (keys.length >= CACHE_MAX_ENTRIES) {
              const drop = keys.slice(0, Math.ceil(keys.length / 4));
              await Promise.all(drop.map((k) => c.delete(k).catch(() => {})));
            }
            c.put(req, res.clone()).catch(() => {});
          }
        }
        return res;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    })());
    return;
  }

  // 网络优先：保证"改完刷新立即生效"
  event.respondWith((async () => {
    const c = await caches.open(VERSION);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await c.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await c.match('/');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});
