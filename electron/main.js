// All-in-One Player — Electron 主进程（桌面版真同步）
// Mineradio 式登录原理：
//  1. 主进程先启动一个只监听 127.0.0.1 的本地服务（electron/server.js），
//     渲染层从它加载同一套网页版代码，并通过它调用 /api/*；
//  2. 登录用内嵌登录窗（独立 session partition，平台 + 身份双隔离）：
//     打开平台官方登录页，扫码在官方页里完成，本应用从不输入第三方密码；
//  3. 登录成功后只把官方 Cookie 收进本机 userData/auth/*.json（0600），
//     服务端用它向官方接口取真实歌单/喜欢歌曲；
//  4. QQ 号与微信是两个独立身份（不同 partition、不同凭证文件），绝不合并；
//     QQ 登录页签二维码间歇性空白是官网侧问题，登录窗内提供重试引导。
'use strict';
const { app, BrowserWindow, shell, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');
const PORT = Number(process.env.ALLINONE_PORT || 0); // 0 = 系统分配临时端口
const LOGIN_URLS = {
  qishui: 'https://www.qishui.com/', spotify: 'https://open.spotify.com/',
  apple: 'https://music.apple.com/', youtube: 'https://music.youtube.com/',
  qq: 'https://y.qq.com/', netease: 'https://music.163.com/#/login',
  kugou: 'https://www.kugou.com/', kuwo: 'https://www.kuwo.cn/'
};
const LOGIN_HINTS = {
  qq: 'QQ登录页签二维码如空白：点「重试」重开，或先切「微信登录」页签再切回 QQ，或复制链接到浏览器扫码。残留会话可能直接快捷登录回已登录账号。',
  netease: '网易云登录页用网易云音乐 App 或微信扫码；扫完在手机上确认。',
  default: '在官方登录窗里扫码登录；本应用不输入任何平台密码。'
};

let serverMod = null;
let httpServer = null;
let serverPort = 0;
let mainWin = null;
let authDir = '';
let trayModeEnabled = false;

function authDirFor() {
  return path.join(app.getPath('userData'), 'auth');
}
function partitionFor(platform, identity) {
  return 'persist:login-' + platform + '-' + (identity || 'default');
}
function requiredKeys(platform) {
  return serverMod && serverMod.ADAPTERS[platform] ? serverMod.ADAPTERS[platform].requiredKeys : [];
}
function cookieDomains(platform) {
  return serverMod && serverMod.ADAPTERS[platform] ? serverMod.ADAPTERS[platform].domains : [];
}

async function harvestCookies(platform, identity) {
  const ses = session.fromPartition(partitionFor(platform, identity));
  const domains = cookieDomains(platform);
  const found = {};
  for (const d of domains) {
    try {
      const list = await ses.cookies.get({ domain: d });
      list.forEach(function (c) { found[c.name] = c.value; });
    } catch (e) { /* 某个域取不到就跳过，不记敏感内容 */ }
  }
  const keys = requiredKeys(platform);
  const ok = keys.length > 0 && keys.every(function (k) { return found[k]; });
  if (ok) {
    const picked = {};
    const keep = serverMod.ADAPTERS[platform].cookieKeys || keys;
    keep.forEach(function (k) { if (found[k]) picked[k] = found[k]; });
    serverMod.writeAuth(authDir, platform, identity, picked);
  }
  return { ok: ok, presentKeys: Object.keys(found) };
}

function notifyMain(event, payload) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(event, payload);
}

function openLoginWindow(platform, identity) {
  identity = identity || (platform === 'qq' ? 'qq' : 'default');
  const url = LOGIN_URLS[platform] || 'https://music.163.com/';
  const ses = session.fromPartition(partitionFor(platform, identity));
  // 关键修复：QQ/网易云等官网会按 User-Agent 下发页面，Electron 默认 UA
  // （含 Electron/xx 字样）可能拿到空白壳页面。登录窗改用标准 Chrome UA。
  try {
    ses.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');
  } catch (e) {}
  const win = new BrowserWindow({
    width: 520, height: 680, title: '登录 · ' + (serverMod.ADAPTERS[platform] ? serverMod.ADAPTERS[platform].label : platform),
    parent: mainWin || undefined, modal: false,
    backgroundColor: '#0a0a0f',
    webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadURL(url);
  // 外链仍走系统浏览器
  win.webContents.setWindowOpenHandler(function (h) {
    if (h.url.startsWith('http')) { shell.openExternal(h.url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  // 登录窗空白/崩溃自救：页面加载失败或渲染进程崩溃时，先自动重载一次，
  // 还不行就弹原生对话框，给「在浏览器打开」兜底（浏览器里扫码同样能登录，
  // 凭证仍只存在官方页与本机）。
  let reloads = 0;
  let failDialogOpen = false;
  const offerFallback = async function (reason) {
    if (win.isDestroyed() || failDialogOpen || done) return;
    failDialogOpen = true;
    try {
      const r = await dialog.showMessageBox(win, {
        type: 'warning',
        title: '登录页打不开',
        message: '官方登录页没有正常显示（' + reason + '）。',
        detail: '可以点「重试」重新加载，或点「在浏览器打开」，用系统浏览器在官方页扫码登录。',
        buttons: ['重试', '在浏览器打开', '关闭'],
        defaultId: 0, cancelId: 2
      });
      if (r.response === 0) { reloads = 0; try { win.loadURL(url); } catch (e) {} }
      else if (r.response === 1) { try { await shell.openExternal(url); } catch (e) {} }
      else { try { win.close(); } catch (e) {} }
    } catch (e) {}
    failDialogOpen = false;
  };
  win.webContents.on('did-fail-load', function (_e, code, desc) {
    if (done || win.isDestroyed()) return;
    if (code === -3) return; // 用户主动中止，不算失败
    if (reloads < 1) { reloads++; try { win.loadURL(url); } catch (e) {} return; }
    offerFallback('加载失败 ' + code + ' ' + desc);
  });
  win.webContents.on('render-process-gone', function (_e, details) {
    if (done || win.isDestroyed()) return;
    if (reloads < 1) { reloads++; try { win.reload(); } catch (e) {} return; }
    offerFallback('页面崩溃 ' + (details && details.reason ? details.reason : ''));
  });

  let done = false;
  let blankNotified = false;
  const startAt = Date.now();
  const finish = async function (how) {
    if (done) return;
    const r = await harvestCookies(platform, identity);
    if (r.ok) {
      done = true;
      try { win.close(); } catch (e) {}
      notifyMain('desktop:login-done', { platform: platform, identity: identity, ok: true, how: how });
    }
    return r.ok;
  };
  // 导航到已登录落地页 / 轮询 Cookie：残留会话快捷登录也会被这里捕获
  win.webContents.on('did-navigate', function () { finish('navigate'); });
  win.webContents.on('did-navigate-in-page', function () { finish('navigate'); });
  const timer = setInterval(async function () {
    if (win.isDestroyed()) { clearInterval(timer); return; }
    const ok = await finish('poll');
    if (ok) { clearInterval(timer); return; }
    // QQ 二维码空白提示：登录页停留 12 秒仍无凭证
    const elapsed = Date.now() - startAt;
    if (!blankNotified && elapsed > 12000) {
      blankNotified = true;
      notifyMain('desktop:login-qr-blank', {
        platform: platform, identity: identity,
        hint: LOGIN_HINTS[platform] || LOGIN_HINTS.default,
        loginUrl: url
      });
    }
  }, 2000);
  win.on('closed', function () { clearInterval(timer); notifyMain('desktop:login-closed', { platform: platform, identity: identity }); });
  return win;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 360, minHeight: 560,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: '全能播放器 OmniRadio+',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.setWindowOpenHandler(function (h) {
    if (h.url.startsWith('http')) { shell.openExternal(h.url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  if (serverPort) win.loadURL('http://127.0.0.1:' + serverPort + '/');
  else win.loadFile(path.join(ROOT_DIR, 'index.html'));
  // 托盘模式开着时，点关闭只是藏进托盘，不退出
  win.on('close', function (e) {
    if (trayModeEnabled) { e.preventDefault(); win.hide(); }
  });
  return win;
}

function registerIpc() {
  ipcMain.handle('desktop:auth-status', async function () {
    return serverMod ? serverMod.authStatus(authDir) : {};
  });
  ipcMain.handle('desktop:login', async function (_e, platform, identity) {
    openLoginWindow(platform, identity);
    return { ok: true, started: true };
  });
  ipcMain.handle('desktop:login-retry', async function (_e, platform, identity) {
    openLoginWindow(platform, identity);
    return { ok: true, started: true };
  });
  ipcMain.handle('desktop:logout', async function (_e, platform, identity) {
    identity = identity || (platform === 'qq' ? 'qq' : 'default');
    try {
      const ses = session.fromPartition(partitionFor(platform, identity));
      await ses.clearStorageData({ storages: ['cookies'] });
    } catch (e) {}
    if (serverMod) serverMod.deleteAuth(authDir, platform, identity);
    return { ok: true };
  });
  ipcMain.handle('desktop:open-external', async function (_e, url) {
    await shell.openExternal(url);
    return { ok: true };
  });
  // 后台托盘：开 = 点关闭时窗口藏进托盘（托盘菜单：显示窗口 / 退出）；关 = 直接退出
  let tray = null;
  ipcMain.handle('desktop:tray-mode', async function (_e, on) {
    trayModeEnabled = !!on;
    if (trayModeEnabled && !tray) {
      const { Tray, Menu } = require('electron');
      tray = new Tray(path.join(__dirname, '..', 'build', 'icon.png'));
      tray.setToolTip('全能播放器 OmniRadio+');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '显示窗口', click: function () { if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus(); } } },
        { label: '退出', click: function () { trayModeEnabled = false; try { if (tray) tray.destroy(); } catch (e) {} app.quit(); } }
      ]));
      tray.on('click', function () { if (mainWin && !mainWin.isDestroyed()) { mainWin.show(); mainWin.focus(); } });
    }
    if (!trayModeEnabled && tray) { try { tray.destroy(); } catch (e) {} tray = null; }
    return { ok: true, trayMode: trayModeEnabled };
  });
  // 桌面歌词小窗：置顶小窗，只显示当前一句歌词（主窗口推送歌词行过来）
  let lyricWin = null;
  ipcMain.handle('desktop:lyrics-window', async function (_e, show) {
    if (show && !lyricWin) {
      lyricWin = new BrowserWindow({
        width: 560, height: 110, frame: false, alwaysOnTop: true, resizable: true,
        transparent: true, skipTaskbar: true,
        // 小窗只加载本应用自己的 data: 页面（无任何远程代码），允许它直接收歌词行
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      lyricWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;font-family:"Noto Serif SC",sans-serif}body{font-size:22px;font-weight:900;text-align:center;padding:0 18px;text-shadow:0 0 18px rgba(0,245,212,.8);-webkit-app-region:drag}</style></head><body><div id="l">全能播放器 · 桌面歌词</div><script>const {ipcRenderer}=require("electron");ipcRenderer.on("lyric-line",(_e,t)=>{document.getElementById("l").textContent=t||""})</script></body></html>'));
      lyricWin.on('closed', function () { lyricWin = null; });
    } else if (!show && lyricWin) { try { lyricWin.close(); } catch (e) {} lyricWin = null; }
    return { ok: true, open: !!lyricWin };
  });
  ipcMain.on('desktop:lyric-line', function (_e, line) {
    if (lyricWin && !lyricWin.isDestroyed()) lyricWin.webContents.send('lyric-line', line);
  });
  ipcMain.handle('desktop:auth-dir', async function () { return authDir; });
}

app.whenReady().then(async function () {
  authDir = authDirFor();
  fs.mkdirSync(authDir, { recursive: true });
  // 启动本地服务（只监听 127.0.0.1）
  try {
    serverMod = require('./server');
    httpServer = serverMod.createServer(ROOT_DIR, authDir);
    await new Promise(function (resolve, reject) {
      httpServer.once('error', reject);
      httpServer.listen(PORT, '127.0.0.1', function () { resolve(); });
    });
    serverPort = httpServer.address().port;
    console.log('[allinone] local server listening on 127.0.0.1:' + serverPort);
  } catch (e) {
    console.error('[allinone] local server failed, falling back to loadFile:', e && e.message);
    serverPort = 0;
  }
  registerIpc();
  mainWin = createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) mainWin = createWindow();
  });
});
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', function () {
  try { if (httpServer) httpServer.close(); } catch (e) {}
});
app.on('will-quit', function () {
  try { if (httpServer) httpServer.close(); } catch (e) {}
});
// 单实例：桌面版只开一个窗口
if (!app.requestSingleInstanceLock()) app.quit();
