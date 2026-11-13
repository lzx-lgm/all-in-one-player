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
  const win = new BrowserWindow({
    width: 520, height: 680, title: '登录 · ' + (serverMod.ADAPTERS[platform] ? serverMod.ADAPTERS[platform].label : platform),
    parent: mainWin || undefined, modal: false,
    webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false }
  });
  win.setMenuBarVisibility(false);
  win.loadURL(url);
  // 外链仍走系统浏览器
  win.webContents.setWindowOpenHandler(function (h) {
    if (h.url.startsWith('http')) { shell.openExternal(h.url); return { action: 'deny' }; }
    return { action: 'allow' };
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
