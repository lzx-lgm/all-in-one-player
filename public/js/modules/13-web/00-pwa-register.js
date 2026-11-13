/* PWA registration (fork addition, v2.0.0).
   网页版可安装：注册 /sw.js，监听 beforeinstallprompt 供界面提示安装。
   桌面版（window.desktopWindow 存在）不注册 — 桌面壳自带更新与离线能力，
   且 Electron 的 file/loopback 环境下 SW 没有意义。防御式：任何失败都不影响启动。 */
(function () {
  'use strict';
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    if (window.desktopWindow && window.desktopWindow.isDesktop) return;
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;

    var register = function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(function (reg) {
        window.__pwaServiceWorker = reg;
        if (typeof reg.update === 'function') {
          // 启动后悄悄检查一次更新；新版 SW 激活后下次打开即生效。
          try { reg.update(); } catch (e) {}
        }
      }).catch(function (e) {
        if (typeof console !== 'undefined' && console.warn) console.warn('[PWA] service worker 注册失败', e);
      });
    };
    if (document.readyState === 'complete' || document.readyState === 'interactive') register();
    else window.addEventListener('load', register);

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      window.__pwaInstallPrompt = e;
      try {
        var ev = new CustomEvent('pwa-install-available');
        window.dispatchEvent(ev);
      } catch (err) {}
    });
    window.addEventListener('appinstalled', function () {
      window.__pwaInstallPrompt = null;
    });
  } catch (e) { /* PWA is optional; never break boot */ }
})();
