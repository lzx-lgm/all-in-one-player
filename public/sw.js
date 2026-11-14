/* 全能播放器 service worker (fork addition, v2.0.0).
   规则：
   - API 请求一律只走网络、绝不缓存（登录态、歌单、播放地址都是活的；
     尤其登录接口绝不能进缓存）。
   - 同源静态资源（css/js/vendor/assets/图标/清单）缓存优先，离线也能打开壳子。
   - 页面导航（/）网络优先、缓存兜底，保证发新版后第一时间拿到新代码。
   - index-loader.js 每次加载都带时间戳参数，天然绕过缓存，不怕旧模块。 */
'use strict';

const CACHE_NAME = 'all-in-one-player-v2.0.2';
const CORE_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/css/index.css',
  '/vendor/three.r128.min.js',
  '/vendor/gsap.min.js',
  '/vendor/music-tempo.min.js',
  '/js/preload-mode.js',
  '/js/index-loader.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // API: network only, never cached.
  if (url.pathname.indexOf('/api/') === 0) {
    event.respondWith(fetch(req));
    return;
  }

  // Navigation: network first, cache fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Same-origin static assets: cache first, network fallback.
  if (/\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|ttf|json|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        });
      })
    );
  }
});
