// All-in-One Player — Electron 主进程（桌面版真同步）
// Mineradio 式登录原理（登录窗代码照 Mineradio 的 desktop/main.js 原样抄过来，
//  GPL-3.0，见 electron/main.js 内 openQQLoginWindow / openNeteaseLoginWindow）：
//  1. 主进程先启动一个只监听 127.0.0.1 的本地服务（electron/server.js），
//     渲染层从它加载同一套网页版代码，并通过它调用 /api/*；
//  2. 登录用内嵌登录窗（独立 session partition，平台 + 身份双隔离）：
//     打开平台官方登录页，页面加载完自动点一下「登录」（二维码自己弹出来），
//     扫码在官方页里完成，本应用从不输入第三方密码；登录窗本身从不重载页面；
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
  // QQ 入口照 Mineradio：先开个人页（能拿到登录态），打不开再回退到首页
  qq: 'https://y.qq.com/n/ryqq/profile', netease: 'https://music.163.com/#/login',
  kugou: 'https://www.kugou.com/', kuwo: 'https://www.kuwo.cn/'
};
const QQ_FALLBACK_URL = 'https://y.qq.com/';
const QQ_WARMUP_URL = 'https://y.qq.com/n/ryqq/player';
// QQ 登录允许在应用内弹窗的官方域（其余外链仍走系统浏览器）
const QQ_TRUSTED_DOMAINS = ['qq.com', 'tencent.com', 'qqmusic.com', 'gtimg.com', 'qpic.cn', 'weixin.qq.com'];
function isTrustedQQUrl(targetUrl) {
  try {
    const parsed = new URL(String(targetUrl || ''));
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return QQ_TRUSTED_DOMAINS.some(function (d) { return host === d || host.endsWith('.' + d); });
  } catch (e) { return false; }
}
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

async function readCookieMap(platform, identity) {
  const ses = session.fromPartition(partitionFor(platform, identity));
  const domains = cookieDomains(platform);
  const found = {};
  for (const d of domains) {
    try {
      const list = await ses.cookies.get({ domain: d });
      list.forEach(function (c) { found[c.name] = c.value; });
    } catch (e) { /* 某个域取不到就跳过，不记敏感内容 */ }
  }
  return found;
}

// QQ 只拿到 uin 不算能播：播放要 qqmusic_key 或 qm_keyst。Mineradio 的做法是
// 先用登录态换播放凭证（暖身页），拿不到就等，超时才退回只认 uin。
function qqPlaybackReady(found) {
  return !!(found && (found.qqmusic_key || found.qm_keyst));
}
function qqLoginOnly(found) {
  return !!(found && found.uin && !qqPlaybackReady(found));
}

async function harvestCookies(platform, identity) {
  const found = await readCookieMap(platform, identity);
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

// ---------------------------------------------------------------- 登录窗
// 照 Mineradio 的登录逻辑原样抄过来（GPL-3.0，本仓库已改 GPL-3.0，见 LICENSE）：
//  - QQ / 网易云的登录窗流程、暖身、自动点「登录」、Cookie 判定，全部按
//    Mineradio 的 desktop/main.js 实现，只把「完成回调」换成我们自己的
//    IPC 事件（desktop:login-done / login-closed / login-qr-blank）与
//    凭证文件写入；窗口分区仍按平台+身份隔离（QQ 号与微信不合并）。
//  - 之前我们自己加的 did-fail-load 重载、render-process-gone 重载、
//    跳转计数弹框、自定义 User-Agent，在 Mineradio 里都不存在，反而可能
//    是「登录窗一直闪」的来源，这次全部去掉，改成 Mineradio 的做法：
//    页面加载完 700ms 自动点一下「登录」，二维码自己弹出来；
//    登录窗本身从不重载页面。
function parseCookieHeader(cookieText) {
  const out = {};
  String(cookieText || '').split(';').forEach(function (part) {
    const raw = String(part || '').trim();
    if (!raw) return;
    const idx = raw.indexOf('=');
    if (idx <= 0) return;
    out[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
  });
  return out;
}
function qqCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const isWechat = !!obj.wxopenid || Number(obj.login_type) === 2;
  const rawUin = isWechat
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const musicKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
  return !!(uin && musicKey);
}
function qqCookieHasPlaybackLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  const isWechat = !!obj.wxopenid || Number(obj.login_type) === 2;
  const rawUin = isWechat
    ? (obj.wxuin || obj.uin || obj.p_uin || '')
    : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin || '');
  const uin = String(rawUin).replace(/\D/g, '');
  const playbackKey = obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
  return !!(uin && playbackKey);
}
function qqLoginCompletionFromCookie(cookieText) {
  if (qqCookieHasPlaybackLogin(cookieText)) return { ok: true, cookie: cookieText };
  if (qqCookieHasLogin(cookieText)) {
    return { ok: false, partial: true, error: 'QQ_PLAYBACK_AUTH_INCOMPLETE', message: 'QQ 账号验证已完成，但 QQ 音乐播放授权尚未生成，请在官方登录窗口完成授权后再关闭' };
  }
  return { ok: false, cancelled: true };
}
function neteaseCookieHasLogin(cookieText) {
  const obj = parseCookieHeader(cookieText);
  return !!obj.MUSIC_U;
}
// 把一个登录分区里的全部 Cookie 读成 header 字符串（照 Mineradio 的做法）
async function readLoginCookieHeader(ses) {
  const cookies = await ses.cookies.get({});
  return cookies.map(function (c) { return c.name + '=' + c.value; }).join('; ');
}
// 二维码空白提示：登录页停留 12 秒仍无凭证时提醒一次
function armQrBlankHint(platform, identity, url, isSettled) {
  return setTimeout(function () {
    if (isSettled()) return;
    notifyMain('desktop:login-qr-blank', { platform: platform, identity: identity, hint: LOGIN_HINTS[platform] || LOGIN_HINTS.default, loginUrl: url });
  }, 12000);
}
const LOGIN_WINDOW_ICON = path.join(__dirname, '..', 'build', 'icon.png');

function openQQLoginWindow(platform, identity, options) {
  options = options || {};
  const ses = session.fromPartition(partitionFor(platform, identity));
  const url = LOGIN_URLS.qq;
  return (async function () {
    const initialCookie = await readLoginCookieHeader(ses);
    if (qqCookieHasPlaybackLogin(initialCookie)) {
      return { ok: true, cookie: initialCookie, reused: true, recovered: !!options.forceReauth };
    }
    if (options.forceReauth) {
      await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
    }
    return new Promise(function (resolve) {
      let settled = false;
      let pollTimer = null;
      let warmupTimer = null;
      let warmupWindow = null;
      let playbackFinalizePending = false;
      let showWatchdog = null;
      const popupWindows = new Set();
      const loginWindow = new BrowserWindow({
        width: 900, height: 720, minWidth: 760, minHeight: 560,
        parent: mainWin && !mainWin.isDestroyed() ? mainWin : undefined,
        modal: false, show: false, autoHideMenuBar: true, title: 'QQ 音乐登录',
        backgroundColor: '#111111', icon: LOGIN_WINDOW_ICON,
        webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false, sandbox: true }
      });
      const blankHintTimer = armQrBlankHint(platform, identity, url, function () { return settled; });
      const closeAuxiliaryWindows = function () {
        if (showWatchdog) { clearTimeout(showWatchdog); showWatchdog = null; }
        if (blankHintTimer) { clearTimeout(blankHintTimer); }
        if (warmupTimer) { clearTimeout(warmupTimer); warmupTimer = null; }
        const windows = Array.from(popupWindows);
        popupWindows.clear();
        if (warmupWindow) windows.push(warmupWindow);
        warmupWindow = null;
        windows.forEach(function (win) { try { if (win && !win.isDestroyed()) win.close(); } catch (e) {} });
      };
      const finish = async function (result) {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        closeAuxiliaryWindows();
        try { await ses.flushStorageData(); } catch (e) {}
        if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
        resolve(result);
      };
      const showLoginWindow = function () {
        if (settled || !loginWindow || loginWindow.isDestroyed() || loginWindow.isVisible()) return;
        loginWindow.show();
        loginWindow.focus();
      };
      const loadQQOfficialLoginEntry = async function () {
        try {
          await loginWindow.loadURL(LOGIN_URLS.qq);
        } catch (firstError) {
          const message = String(firstError && firstError.message || firstError || '');
          if (/HTTP2|PROTOCOL_ERROR|ERR_FAILED/i.test(message)) {
            try { await ses.clearCache(); } catch (e) {}
          }
          console.warn('QQ profile login entry failed, retrying official homepage:', message);
          await loginWindow.loadURL(QQ_FALLBACK_URL);
        }
      };
      const schedulePlaybackWarmup = function () {
        if (settled || warmupTimer || warmupWindow) return;
        // 给官方 OAuth 回调留出时间，把通用 QQ 会话换成 qm_keyst/qqmusic_key。
        // 暖身页跑在隐藏窗里，绝不替换登录回调页。
        warmupTimer = setTimeout(function () {
          warmupTimer = null;
          if (settled || !loginWindow || loginWindow.isDestroyed()) return;
          warmupWindow = new BrowserWindow({
            width: 720, height: 520, parent: loginWindow, modal: false, show: false, autoHideMenuBar: true,
            backgroundColor: '#111111', icon: LOGIN_WINDOW_ICON,
            webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false, sandbox: true }
          });
          warmupWindow.on('closed', function () { warmupWindow = null; });
          warmupWindow.webContents.on('did-finish-load', checkCookies);
          warmupWindow.loadURL(QQ_WARMUP_URL).catch(function (e) { console.warn('QQ login warmup navigation failed:', e.message); });
        }, 5000);
      };
      const checkCookies = async function () {
        try {
          const cookie = await readLoginCookieHeader(ses);
          if (qqCookieHasPlaybackLogin(cookie)) {
            if (playbackFinalizePending) return;
            playbackFinalizePending = true;
            // QQ 会把播放凭证和其它 Cookie 一阵一阵写进来，等 450ms 再读最终版
            await new Promise(function (resolveDelay) { setTimeout(resolveDelay, 450); });
            const finalizedCookie = await readLoginCookieHeader(ses);
            await finish({ ok: true, cookie: qqCookieHasPlaybackLogin(finalizedCookie) ? finalizedCookie : cookie });
          } else if (qqCookieHasLogin(cookie)) {
            schedulePlaybackWarmup();
          }
        } catch (e) {
          if (!settled) playbackFinalizePending = false;
          console.warn('QQ login cookie check failed:', e.message);
        }
      };
      const installQQLoginWindowHandlers = function (win, isRoot) {
        if (!win || win.isDestroyed()) return;
        win.webContents.setWindowOpenHandler(function (h) {
          if (isTrustedQQUrl(h.url)) {
            return { action: 'allow', overrideBrowserWindowOptions: {
              width: 760, height: 640, parent: loginWindow, modal: false, show: true, autoHideMenuBar: true,
              backgroundColor: '#111111', icon: LOGIN_WINDOW_ICON,
              webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false, sandbox: true }
            } };
          }
          if (/^https?:\/\//i.test(String(h.url || ''))) { shell.openExternal(h.url).catch(function () {}); }
          return { action: 'deny' };
        });
        win.webContents.on('did-create-window', function (child) {
          popupWindows.add(child);
          child.on('closed', function () { popupWindows.delete(child); });
          installQQLoginWindowHandlers(child, false);
        });
        if (!isRoot) win.webContents.on('did-finish-load', checkCookies);
      };
      installQQLoginWindowHandlers(loginWindow, true);
      loginWindow.webContents.on('did-finish-load', function () {
        checkCookies();
        showLoginWindow();
        // 关键：页面加载完 700ms 自动点一下「登录」，二维码自己弹出来。
        // 之前我们没点这一下，页面只停在个人页外壳（顶栏能出来、正文一直转圈）。
        loginWindow.webContents.executeJavaScript(`
          setTimeout(() => {
            const nodes = Array.from(document.querySelectorAll('a, button, span, div'));
            const loginNode = nodes.find((node) => {
              const text = (node.textContent || '').trim();
              if (!/登录|登陆/.test(text)) return false;
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (loginNode) loginNode.click();
          }, 700);
        `, true).catch(function () {});
      });
      loginWindow.on('ready-to-show', showLoginWindow);
      loginWindow.on('closed', async function () {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        closeAuxiliaryWindows();
        try {
          const cookie = await readLoginCookieHeader(ses);
          try { await ses.flushStorageData(); } catch (e) {}
          resolve(qqLoginCompletionFromCookie(cookie));
        } catch (e) {
          resolve({ ok: false, error: e.message || 'QQ 登录窗口已关闭' });
        }
      });
      pollTimer = setInterval(checkCookies, 1200);
      showWatchdog = setTimeout(showLoginWindow, 2500);
      loadQQOfficialLoginEntry().catch(function (e) { finish({ ok: false, error: e.message }); });
    });
  })();
}

function openNeteaseLoginWindow(platform, identity, options) {
  options = options || {};
  const ses = session.fromPartition(partitionFor(platform, identity));
  const url = LOGIN_URLS.netease;
  return (async function () {
    const initialCookie = await readLoginCookieHeader(ses);
    if (neteaseCookieHasLogin(initialCookie)) return { ok: true, cookie: initialCookie, reused: true };
    if (options.forceReauth) {
      await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
    }
    return new Promise(function (resolve) {
      let settled = false;
      let pollTimer = null;
      const loginWindow = new BrowserWindow({
        width: 940, height: 760, minWidth: 780, minHeight: 580,
        parent: mainWin && !mainWin.isDestroyed() ? mainWin : undefined,
        modal: false, show: false, autoHideMenuBar: true, title: '网易云音乐登录',
        backgroundColor: '#111111', icon: LOGIN_WINDOW_ICON,
        webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false, sandbox: true }
      });
      const blankHintTimer = armQrBlankHint(platform, identity, url, function () { return settled; });
      const finish = async function (result) {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        clearTimeout(blankHintTimer);
        if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
        resolve(result);
      };
      const checkCookies = async function () {
        try {
          const cookie = await readLoginCookieHeader(ses);
          if (neteaseCookieHasLogin(cookie)) finish({ ok: true, cookie: cookie });
        } catch (e) {
          console.warn('Netease login cookie check failed:', e.message);
        }
      };
      loginWindow.webContents.setWindowOpenHandler(function (h) {
        if (/^https?:\/\/([^/]+\.)?(163|music\.163|netease)\.com/i.test(h.url)) {
          loginWindow.loadURL(h.url).catch(function (e) { console.warn('Netease login popup navigation failed:', e.message); });
        } else if (/^https?:\/\//i.test(h.url)) {
          shell.openExternal(h.url).catch(function () {});
        }
        return { action: 'deny' };
      });
      loginWindow.webContents.on('did-finish-load', function () {
        checkCookies();
        // 页面加载完 900ms 自动点一下「登录」，二维码自己弹出来（主文档 + iframe 里都找）
        loginWindow.webContents.executeJavaScript(`
          setTimeout(() => {
            const docs = [document];
            document.querySelectorAll('iframe').forEach((frame) => {
              try { if (frame.contentDocument) docs.push(frame.contentDocument); } catch (_) {}
            });
            for (const doc of docs) {
              const nodes = Array.from(doc.querySelectorAll('a, button, span, div'));
              const loginNode = nodes.find((node) => {
                const text = (node.textContent || '').trim();
                if (!/登录|立即登录/.test(text)) return false;
                const rect = node.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
              });
              if (loginNode) { loginNode.click(); return true; }
            }
            return false;
          }, 900);
        `, true).catch(function () {});
      });
      loginWindow.on('ready-to-show', function () { loginWindow.show(); });
      loginWindow.on('closed', async function () {
        if (settled) return;
        if (pollTimer) clearInterval(pollTimer);
        clearTimeout(blankHintTimer);
        try {
          const cookie = await readLoginCookieHeader(ses);
          resolve(neteaseCookieHasLogin(cookie)
            ? { ok: true, cookie: cookie }
            : { ok: false, cancelled: true, message: '网易云登录窗口已关闭' });
        } catch (e) {
          resolve({ ok: false, error: e.message || '网易云登录窗口已关闭' });
        }
      });
      pollTimer = setInterval(checkCookies, 1200);
      loginWindow.loadURL(url).catch(function (e) { finish({ ok: false, error: e.message }); });
    });
  })();
}

function openGenericLoginWindow(platform, identity, options) {
  options = options || {};
  const ses = session.fromPartition(partitionFor(platform, identity));
  const url = LOGIN_URLS[platform] || 'https://music.163.com/';
  const keys = requiredKeys(platform);
  return (async function () {
    if (options.forceReauth) {
      await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'cachestorage'] });
    }
    const initial = await readCookieMap(platform, identity);
    if (keys.length && keys.every(function (k) { return initial[k]; })) return { ok: true, reused: true };
    return new Promise(function (resolve) {
      let settled = false;
      let pollTimer = null;
      let showWatchdog = null;
      const label = serverMod.ADAPTERS[platform] ? serverMod.ADAPTERS[platform].label : platform;
      const loginWindow = new BrowserWindow({
        width: 900, height: 720, minWidth: 760, minHeight: 560,
        parent: mainWin && !mainWin.isDestroyed() ? mainWin : undefined,
        modal: false, show: false, autoHideMenuBar: true, title: '登录 · ' + label,
        backgroundColor: '#111111', icon: LOGIN_WINDOW_ICON,
        webPreferences: { partition: partitionFor(platform, identity), contextIsolation: true, nodeIntegration: false, sandbox: true }
      });
      const blankHintTimer = armQrBlankHint(platform, identity, url, function () { return settled; });
      const showLoginWindow = function () {
        if (settled || !loginWindow || loginWindow.isDestroyed() || loginWindow.isVisible()) return;
        loginWindow.show();
        loginWindow.focus();
      };
      const finish = async function (result) {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (showWatchdog) clearTimeout(showWatchdog);
        clearTimeout(blankHintTimer);
        try { await ses.flushStorageData(); } catch (e) {}
        if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
        resolve(result);
      };
      const checkCookies = async function () {
        try {
          const found = await readCookieMap(platform, identity);
          if (keys.length && keys.every(function (k) { return found[k]; })) finish({ ok: true });
        } catch (e) {}
      };
      loginWindow.webContents.setWindowOpenHandler(function (h) {
        if (h.url.startsWith('http')) { shell.openExternal(h.url); return { action: 'deny' }; }
        return { action: 'allow' };
      });
      loginWindow.webContents.on('did-finish-load', function () {
        checkCookies();
        showLoginWindow();
      });
      loginWindow.on('ready-to-show', showLoginWindow);
      loginWindow.on('closed', async function () {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (showWatchdog) clearTimeout(showWatchdog);
        clearTimeout(blankHintTimer);
        try {
          const found = await readCookieMap(platform, identity);
          resolve(keys.length && keys.every(function (k) { return found[k]; })
            ? { ok: true }
            : { ok: false, cancelled: true });
        } catch (e) {
          resolve({ ok: false, cancelled: true });
        }
      });
      pollTimer = setInterval(checkCookies, 1200);
      showWatchdog = setTimeout(showLoginWindow, 2500);
      loginWindow.loadURL(url).catch(function (e) { finish({ ok: false, error: e.message }); });
    });
  })();
}

async function openLoginWindow(platform, identity, options) {
  options = options || {};
  identity = identity || (platform === 'qq' ? 'qq' : 'default');
  let result;
  try {
    if (platform === 'qq') result = await openQQLoginWindow(platform, identity, options);
    else if (platform === 'netease') result = await openNeteaseLoginWindow(platform, identity, options);
    else result = await openGenericLoginWindow(platform, identity, options);
  } catch (e) {
    result = { ok: false, error: e && e.message };
  }
  if (result && result.ok) {
    // 把 Cookie 收进本机凭证文件（只存白名单里的键，值永不进日志）
    try {
      const ses = session.fromPartition(partitionFor(platform, identity));
      const header = result.cookie || await readLoginCookieHeader(ses);
      const obj = parseCookieHeader(header);
      const keep = (serverMod.ADAPTERS[platform] && serverMod.ADAPTERS[platform].cookieKeys) || requiredKeys(platform);
      const picked = {};
      keep.forEach(function (k) { if (obj[k]) picked[k] = obj[k]; });
      if (Object.keys(picked).length) serverMod.writeAuth(authDir, platform, identity, picked);
    } catch (e) { console.warn('save login auth failed:', e.message); }
    notifyMain('desktop:login-done', { platform: platform, identity: identity, ok: true, reused: !!result.reused });
  } else if (result && result.partial) {
    notifyMain('desktop:login-closed', { platform: platform, identity: identity, partial: true, message: result.message || '' });
  } else {
    notifyMain('desktop:login-closed', { platform: platform, identity: identity });
  }
  return result;
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
    openLoginWindow(platform, identity).catch(function (e) { console.warn('login window failed:', e && e.message); });
    return { ok: true, started: true };
  });
  ipcMain.handle('desktop:login-retry', async function (_e, platform, identity) {
    // 重试 = 先清掉这个登录窗的旧会话再重开（照 Mineradio 的 forceReauth）
    openLoginWindow(platform, identity, { forceReauth: true }).catch(function (e) { console.warn('login window failed:', e && e.message); });
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
  // PotPlayer 式兜底：浏览器解不了的本地视频，交给系统默认播放器（装了 PotPlayer 就是它）
  ipcMain.handle('desktop:open-file-player', async function (_e, filePath) {
    if (typeof filePath !== 'string' || !filePath || !fs.existsSync(filePath)) return { ok: false, reason: '文件不存在或路径无效' };
    const err = await shell.openPath(filePath);
    if (err) return { ok: false, reason: err };
    return { ok: true };
  });
  // 媒体信息：用 ffprobe（系统装了才有）读容器/编码/帧率/码率；没装就如实返回不可用
  ipcMain.handle('desktop:media-info', async function (_e, filePath) {
    if (typeof filePath !== 'string' || !filePath || !fs.existsSync(filePath)) return { ok: false, reason: '文件不存在或路径无效' };
    try {
      const { execFile } = require('child_process');
      const out = await new Promise(function (resolve, reject) {
        execFile('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
          { timeout: 8000, maxBuffer: 1024 * 1024 }, function (err, stdout) { if (err) reject(err); else resolve(stdout); });
      });
      const info = JSON.parse(out);
      const streams = (info.streams || []).map(function (s) {
        return { type: s.codec_type, codec: s.codec_name, width: s.width, height: s.height, fps: s.r_frame_rate, bitrate: s.bit_rate, channels: s.channels, language: s.tags && s.tags.language, title: s.tags && s.tags.title };
      });
      return { ok: true, format: info.format && info.format.format_name, duration: info.format && info.format.duration, size: info.format && info.format.size, bitrate: info.format && info.format.bit_rate, streams: streams };
    } catch (e) {
      return { ok: false, reason: (e && e.code === 'ENOENT') ? 'no_ffprobe' : 'probe_failed' };
    }
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
