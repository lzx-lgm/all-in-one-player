// All-in-One Player — Electron 预加载桥（contextIsolation 安全桥接）
// 渲染层只能通过这里暴露的白名单调用主进程：
// 登录（打开内嵌官方登录窗）、登出、登录状态、重新登录、打开外链、
// 以及订阅主进程发来的登录事件。凭证值永不经过这座桥传给渲染层。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  platform: process.platform,
  authStatus: function () { return ipcRenderer.invoke('desktop:auth-status'); },
  login: function (platform, identity) { return ipcRenderer.invoke('desktop:login', platform, identity); },
  loginRetry: function (platform, identity) { return ipcRenderer.invoke('desktop:login-retry', platform, identity); },
  logout: function (platform, identity) { return ipcRenderer.invoke('desktop:logout', platform, identity); },
  openExternal: function (url) { return ipcRenderer.invoke('desktop:open-external', url); },
  onLoginEvent: function (cb) {
    ipcRenderer.on('desktop:login-done', function (_e, p) { cb('login-done', p); });
    ipcRenderer.on('desktop:login-qr-blank', function (_e, p) { cb('login-qr-blank', p); });
    ipcRenderer.on('desktop:login-closed', function (_e, p) { cb('login-closed', p); });
  }
});

// 兼容旧代码：网页版用 window.__DESKTOP__ 判断是否在桌面版里
window.__DESKTOP__ = { platform: process.platform, electron: true };
