// All-in-One Player — 桌面版本地服务（Electron 主进程启动）
// Mineradio 式原理：
//  - 只监听 127.0.0.1（本机回环），渲染层与它同源，静态网页版完全不受影响；
//  - 登录凭证只保存在本机 userData 目录下的 auth/*.json（0600 权限），
//    永不打印、永不记入日志、永不提交进仓库；
//  - 用凭证在服务端（本机）向平台官方接口请求用户的真实歌单/喜欢歌曲，
//    再把「歌单结构 + 可播地址」交给渲染层。静态网页版做不到这一点，
//    因为浏览器同源策略读不到其它域名的 Cookie。
//  - 不绕过任何付费/会员限制：拿不到可播地址就如实返回 vip_required /
//    login_required，渲染层再去其它已登录平台按歌名+艺人+时长匹配换源。
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------- 工具
function log(...args) {
  // 只记平台 + 动作，不记 Cookie 值、Token、账号昵称以外的内容。
  console.log('[allinone-server]', ...args);
}
function safeJsonParse(text) { try { return JSON.parse(text); } catch (e) { return null; } }
function cookieHeader(cookies) {
  return Object.keys(cookies).map(function (k) { return k + '=' + cookies[k]; }).join('; ');
}
function fetchText(url, opts) {
  opts = opts || {};
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: opts.method || 'GET',
      headers: Object.assign({
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        Referer: opts.referer || ('https://' + u.hostname + '/')
      }, opts.headers || {}),
      timeout: FETCH_TIMEOUT_MS
    }, function (res) {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
async function fetchJson(url, cookies, opts) {
  opts = opts || {};
  const headers = {};
  if (cookies) headers.Cookie = cookieHeader(cookies);
  if (opts.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const r = await fetchText(url, Object.assign({}, opts, { headers: headers }));
  return { status: r.status, json: safeJsonParse(r.body), raw: r.body };
}

// ---------------------------------------------------------------- 平台适配器
// 每个平台：登录页、要收的 Cookie 键、取歌单/取可播地址的方法。
// identity 只对 QQ 有意义：'qq' 与 'wechat' 是两个独立身份，绝不合并。
//   QQ 号身份：uin + qqmusic_key + qm_keyst（有歌单的那个身份）
//   微信身份：同样走 y.qq.com，但登录页签是「微信登录」，资产与 QQ 号不互通
// 网易云：MUSIC_U 为主。
// 其它平台：登录窗 + 凭证收存已就绪；曲库直取为 best-effort，
//   取不到时返回结构化失败（不编假数据），渲染层按该原因提示或换源。
const ADAPTERS = {
  netease: {
    label: '网易云音乐', loginUrl: 'https://music.163.com/#/login',
    domains: ['music.163.com', '.music.163.com'],
    cookieKeys: ['MUSIC_U', 'MUSIC_A', '__csrf'],
    requiredKeys: ['MUSIC_U'],
    async library(cookies) {
      const acc = await fetchJson('https://music.163.com/api/nuser/account', cookies);
      const profile = acc.json && (acc.json.profile || (acc.json.account && acc.json.account.id && { userId: acc.json.account.id }));
      const uid = profile && (profile.userId || profile.id);
      if (!uid || acc.status === 301) return { ok: false, reason: 'login_required', detail: '网易云登录已失效，请重新扫码登录' };
      const pl = await fetchJson('https://music.163.com/api/user/playlist?uid=' + uid + '&limit=1000&offset=0', cookies);
      const list = (pl.json && pl.json.playlist) || [];
      const playlists = list.map(function (p) {
        return {
          id: String(p.id), name: p.name, trackCount: p.trackCount,
          subscribed: !!(p.subscribed || (p.creator && p.creator.userId !== uid)),
          creator: p.creator ? p.creator.nickname : '', specialType: p.specialType || 0
        };
      });
      const liked = playlists.find(function (p) { return p.specialType === 5; }) || null;
      return { ok: true, uid: String(uid), playlists: playlists, likedPlaylistId: liked ? liked.id : null };
    },
    async playlistTracks(cookies, playlistId) {
      const d = await fetchJson('https://music.163.com/api/v6/playlist/detail?id=' + encodeURIComponent(playlistId), cookies);
      const ids = ((d.json && d.json.playlist && d.json.playlist.trackIds) || []).slice(0, 100).map(function (t) { return t.id; });
      if (!ids.length) return { ok: true, tracks: [] };
      const s = await fetchJson('https://music.163.com/api/song/detail?ids=' + ids.join(','), cookies);
      const songs = ((s.json && s.json.songs) || []).map(function (x) {
        return { id: String(x.id), title: x.name, artist: (x.ar || []).map(function (a) { return a.name; }).join(' / '), durationMs: x.dt || 0, album: x.al ? x.al.name : '' };
      });
      return { ok: true, tracks: songs };
    },
    async audioUrl(cookies, songId) {
      const r = await fetchJson('https://music.163.com/api/song/enhance/player/url/v1?id=' + encodeURIComponent(songId) + '&level=standard', cookies,
        { method: 'POST', body: 'ids=[' + songId + ']&level=standard&encodeType=mp3' });
      const item = r.json && r.json.data && r.json.data[0];
      if (item && item.url) return { ok: true, url: item.url };
      if (r.json && r.json.code === 401) return { ok: false, reason: 'login_required' };
      return { ok: false, reason: 'vip_required', detail: '该曲目在网易云需会员或无可播地址' };
    }
  },
  qq: {
    label: 'QQ音乐', loginUrl: 'https://y.qq.com/',
    domains: ['y.qq.com', '.qq.com', '.y.qq.com'],
    cookieKeys: ['uin', 'qqmusic_key', 'qm_keyst', 'qm_keyst'],
    requiredKeys: ['uin'],
    // QQ 登录页签二维码间歇性空白：这不是本应用能修的官网问题。
    // 桌面版登录窗内遇到空白时，渲染层按「重试 / 先切微信页签再切回 / 刷新 / 复制链接到浏览器」引导；
    // 残留会话的快捷登录会自动登回已登录账号，此时直接按已登录处理。
    async library(cookies) {
      const uin = String(cookies.uin || '').replace(/^o0*/, '');
      const prof = await fetchJson('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_home_page?cid=205360838&ct=20&userid=' + encodeURIComponent(uin) + '&uin=' + encodeURIComponent(uin), cookies,
        { referer: 'https://y.qq.com/' });
      const data = prof.json && prof.json.data;
      if (!data || prof.status === 401) return { ok: false, reason: 'login_required', detail: 'QQ 登录已失效，请重新扫码登录' };
      const mydiss = data.mydiss || data.myDiss || [];
      const playlists = mydiss.map(function (d) {
        return { id: String(d.dissid || d.id), name: d.dissname || d.name, trackCount: d.song_cnt || d.songnum || 0, subscribed: false, creator: '', specialType: 0 };
      });
      // 「我喜欢」在 QQ 是 dissid 为 0 附近的特殊歌单；若 profile 未给，单独取喜欢列表
      let liked = playlists.find(function (p) { return /喜欢/.test(p.name); }) || null;
      return { ok: true, uid: uin, playlists: playlists, likedPlaylistId: liked ? liked.id : null, note: 'QQ 的「我喜欢」与自建歌单以 profile 页返回为准；微信身份的资产与 QQ 号不互通' };
    },
    async playlistTracks(cookies, playlistId) {
      const uin = String(cookies.uin || '').replace(/^o0*/, '');
      const body = JSON.stringify({ comm: { ct: 24, cv: 0 }, cdlist: { module: 'CDInfo', method: 'getUCCdInfo', param: { disstid: Number(playlistId) || 0, onlysonglist: true, song_begin: 0, song_num: 100 } } });
      const r = await fetchJson('https://u.y.qq.com/cgi-bin/musicu.fcg', cookies,
        { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' } });
      const list = (r.json && r.json.cdlist && r.json.cdlist.data && r.json.cdlist.data.songlist) || [];
      return { ok: true, tracks: list.map(function (s) { return { id: String(s.songmid || s.songid), title: s.songname, artist: (s.singer || []).map(function (a) { return a.name; }).join(' / '), durationMs: (s.interval || 0) * 1000, album: s.albumname || '' }; }) };
    },
    async audioUrl(cookies, songmid) {
      const uin = String(cookies.uin || '').replace(/^o0*/, '');
      const body = JSON.stringify({
        comm: { uin: uin, format: 'json', ct: 24, cv: 0 },
        req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: [songmid], songtype: [0], uin: uin, loginflag: 1, platform: '20' } }
      });
      const r = await fetchJson('https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=0&loginUin=' + encodeURIComponent(uin), cookies,
        { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' } });
      const purl = r.json && r.json.req_0 && r.json.req_0.data && r.json.req_0.data.midurlinfo && r.json.req_0.data.midurlinfo[0] && r.json.req_0.data.midurlinfo[0].purl;
      const sip = r.json && r.json.req_0 && r.json.req_0.data && r.json.req_0.data.sip && r.json.req_0.data.sip[0];
      if (purl) return { ok: true, url: (sip || 'https://ws.stream.qqmusic.qq.com/') + purl };
      return { ok: false, reason: 'vip_required', detail: '该曲目在 QQ音乐 需会员或无可播地址，可换源到其它已登录平台' };
    }
  },
  kugou: {
    label: '酷狗音乐', loginUrl: 'https://www.kugou.com/',
    domains: ['kugou.com', '.kugou.com'], cookieKeys: ['KgUserId', 'token', 'kg_mid'], requiredKeys: ['KgUserId'],
    async library() { return { ok: false, reason: 'provider_api_unstable', detail: '酷狗网页端曲库接口不稳定，桌面版 v1 暂只保存登录态；歌单请在酷狗官方应用内查看，或用其它已登录平台换源' }; },
    async playlistTracks() { return { ok: false, reason: 'provider_api_unstable' }; },
    async audioUrl() { return { ok: false, reason: 'provider_api_unstable' }; }
  },
  kuwo: {
    label: '酷我音乐', loginUrl: 'https://www.kuwo.cn/',
    domains: ['kuwo.cn', '.kuwo.cn'], cookieKeys: ['kw_token', 'Hm_lvt'], requiredKeys: ['kw_token'],
    async library() { return { ok: false, reason: 'provider_api_unstable', detail: '酷我网页端曲库接口需动态 csrf，桌面版 v1 暂只保存登录态；歌单请在酷我官方应用内查看' }; },
    async playlistTracks() { return { ok: false, reason: 'provider_api_unstable' }; },
    async audioUrl() { return { ok: false, reason: 'provider_api_unstable' }; }
  },
  qishui: {
    label: '汽水音乐', loginUrl: 'https://www.qishui.com/',
    domains: ['qishui.com', '.qishui.com'], cookieKeys: ['sessionid', 'sid'], requiredKeys: ['sessionid'],
    async library() { return { ok: false, reason: 'provider_api_unstable', detail: '汽水音乐网页端曲库接口不稳定，且付费歌常只给试听；桌面版 v1 暂只保存登录态，播放时按试听/VIP 自动换源到其它已登录平台' }; },
    async playlistTracks() { return { ok: false, reason: 'provider_api_unstable' }; },
    async audioUrl() { return { ok: false, reason: 'preview_only', detail: '汽水常只给试听片段，请换源到其它已登录平台' }; }
  },
  spotify: {
    label: 'Spotify', loginUrl: 'https://open.spotify.com/',
    domains: ['spotify.com', '.spotify.com'], cookieKeys: ['sp_dc', 'sp_key'], requiredKeys: ['sp_dc'],
    // 与 Mineradio 的实测结论一致：Spotify 官方 Web API 不提供音频直链，
    // Cookie 也换不到 Bearer 播放地址，因此不编造可播地址。
    async library() { return { ok: false, reason: 'spotify_no_direct_link', detail: 'Spotify 官方不提供音频直链，无法在本应用内直接取歌单音频；播放时按歌名+艺人+时长自动换源到其它已登录平台' }; },
    async playlistTracks() { return { ok: false, reason: 'spotify_no_direct_link' }; },
    async audioUrl() { return { ok: false, reason: 'spotify_no_direct_link' }; }
  },
  apple: {
    label: 'Apple Music', loginUrl: 'https://music.apple.com/',
    domains: ['music.apple.com', '.apple.com'], cookieKeys: ['media-user-token'], requiredKeys: ['media-user-token'],
    async library(cookies) {
      const r = await fetchJson('https://amp-api.music.apple.com/v1/me/library/playlists?limit=100', cookies,
        { headers: { Authorization: 'Bearer ' + cookies['media-user-token'] } });
      if (r.status === 401) return { ok: false, reason: 'login_required', detail: 'Apple Music 登录已失效，请重新登录' };
      const list = (r.json && r.json.data) || [];
      return { ok: true, playlists: list.map(function (p) { return { id: p.id, name: p.attributes ? p.attributes.name : p.id, trackCount: 0, subscribed: false, creator: '', specialType: 0 }; }), likedPlaylistId: null };
    },
    async playlistTracks() { return { ok: false, reason: 'provider_api_unstable' }; },
    async audioUrl() { return { ok: false, reason: 'apple_official_link', detail: 'Apple Music 音频由官方客户端/网页负责，本应用只做浏览与控制，不提取 DRM 音频' }; }
  },
  youtube: {
    label: 'YouTube Music', loginUrl: 'https://music.youtube.com/',
    domains: ['music.youtube.com', '.youtube.com'], cookieKeys: ['SAPISID', 'APISID'], requiredKeys: ['SAPISID'],
    async library() { return { ok: false, reason: 'provider_api_unstable', detail: 'YouTube Music 需 Innertube 认证头，桌面版 v1 暂只保存登录态；歌单请在官方页面查看，播放可走应用内演示链路或换源' }; },
    async playlistTracks() { return { ok: false, reason: 'provider_api_unstable' }; },
    async audioUrl() { return { ok: false, reason: 'provider_api_unstable' }; }
  }
};

// ---------------------------------------------------------------- 凭证存储（本机 only）
function authFile(authDir, platform, identity) {
  return path.join(authDir, platform + '-' + (identity || 'default') + '.json');
}
function readAuth(authDir, platform, identity) {
  try {
    const raw = fs.readFileSync(authFile(authDir, platform, identity), 'utf8');
    const data = JSON.parse(raw);
    if (!data || !data.cookies) return null;
    const ageDays = (Date.now() - (data.savedAt || 0)) / 86400000;
    if (ageDays > 30) return Object.assign({}, data, { expired: true });
    return Object.assign({}, data, { expired: false });
  } catch (e) { return null; }
}
function writeAuth(authDir, platform, identity, cookies) {
  fs.mkdirSync(authDir, { recursive: true });
  const file = authFile(authDir, platform, identity);
  fs.writeFileSync(file, JSON.stringify({ platform: platform, identity: identity || 'default', savedAt: Date.now(), cookies: cookies }, null, 2), { mode: 0o600 });
  log('auth saved', platform, identity || 'default', 'keys:', Object.keys(cookies).join(','));
}
function deleteAuth(authDir, platform, identity) {
  try { fs.unlinkSync(authFile(authDir, platform, identity)); } catch (e) {}
  log('auth deleted', platform, identity || 'default');
}
function authStatus(authDir) {
  const out = {};
  Object.keys(ADAPTERS).forEach(function (id) {
    const identities = id === 'qq' ? ['qq', 'wechat'] : ['default'];
    out[id] = identities.map(function (ident) {
      const a = readAuth(authDir, id, ident);
      if (!a) return { identity: ident, state: 'out' };
      return { identity: ident, state: a.expired ? 'expired' : 'in', savedAt: a.savedAt, cookieKeys: Object.keys(a.cookies) };
    });
  });
  return out;
}

// ---------------------------------------------------------------- HTTP 服务
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

function createServer(rootDir, authDir) {
  const server = http.createServer(async function (req, res) {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      // ---- API
      if (u.pathname === '/api/auth/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, status: authStatus(authDir) }));
        return;
      }
      const libMatch = u.pathname.match(/^\/api\/([a-z]+)\/library$/);
      if (libMatch) {
        const platform = libMatch[1];
        const identity = u.searchParams.get('identity') || (platform === 'qq' ? 'qq' : 'default');
        const adapter = ADAPTERS[platform];
        if (!adapter) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, reason: 'unknown_platform' })); return; }
        const auth = readAuth(authDir, platform, identity);
        if (!auth || auth.expired) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, reason: auth && auth.expired ? 'login_expired' : 'login_required', detail: adapter.label + '未登录或登录已过期，请重新扫码登录', platform: platform, identity: identity }));
          return;
        }
        const result = await adapter.library(auth.cookies);
        log('library', platform, identity, 'ok:', !!result.ok, 'reason:', result.reason || '-');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ platform: platform, identity: identity }, result)));
        return;
      }
      const tracksMatch = u.pathname.match(/^\/api\/([a-z]+)\/playlist-tracks$/);
      if (tracksMatch) {
        const platform = tracksMatch[1];
        const identity = u.searchParams.get('identity') || (platform === 'qq' ? 'qq' : 'default');
        const adapter = ADAPTERS[platform];
        const auth = adapter && readAuth(authDir, platform, identity);
        if (!auth || auth.expired) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, reason: 'login_required' })); return; }
        const result = await adapter.playlistTracks(auth.cookies, u.searchParams.get('id') || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ platform: platform, identity: identity }, result)));
        return;
      }
      const audioMatch = u.pathname.match(/^\/api\/([a-z]+)\/audio$/);
      if (audioMatch) {
        const platform = audioMatch[1];
        const identity = u.searchParams.get('identity') || (platform === 'qq' ? 'qq' : 'default');
        const adapter = ADAPTERS[platform];
        const auth = adapter && readAuth(authDir, platform, identity);
        if (!auth || auth.expired) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, reason: 'login_required' })); return; }
        const result = await adapter.audioUrl(auth.cookies, u.searchParams.get('id') || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(Object.assign({ platform: platform, identity: identity }, result)));
        return;
      }
      // ---- 静态文件（网页版同一套代码；只允许公开的页面资源，拒绝其它文件）
      let filePath = u.pathname === '/' ? '/index.html' : u.pathname;
      const ALLOWED = ['/index.html'];
      const ALLOWED_DIRS = ['/css/', '/js/', '/assets/', '/build/'];
      const allowed = ALLOWED.indexOf(filePath) >= 0 || ALLOWED_DIRS.some(function (d) { return filePath.indexOf(d) === 0; });
      if (!allowed) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      filePath = path.normalize(path.join(rootDir, filePath));
      if (filePath.indexOf(rootDir) !== 0 || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      log('server error', String(e && e.message || e));
      try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, reason: 'server_error' })); } catch (e2) {}
    }
  });
  return server;
}

module.exports = { createServer, ADAPTERS, authStatus, readAuth, writeAuth, deleteAuth };
