'use strict';

// Kuwo Music (酷我音乐) adapter — fork addition for all-in-one-player v2.0.0.
// No npm dependency, no login required for search / public playlists / lyrics / playback.
// Auth is a self-generated token: Cookie kw_token=<random> + csrf header + Referer.
// Reference implementations: guohuiyuan/music-lib (kuwo/kuwo.go), unm_engine_kuwo,
// foamzou/audio-get (processor/kuwo). Endpoints are unofficial and may change;
// failures are reported as structured errors, never faked as success.

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const KUWO_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const KUWO_REFERER = 'http://www.kuwo.cn/';
const KUWO_SEARCH_URL = 'http://www.kuwo.cn/api/www/search/searchMusicBykeyWord';
const KUWO_SONGINFO_LRC = 'http://m.kuwo.cn/newh5/singles/songinfoandlrc';
const KUWO_PLAY_MOBI = 'https://mobi.kuwo.cn/mobi.s';
const KUWO_PLAY_WEB = 'http://www.kuwo.cn/api/v1/www/music/playUrl';
const KUWO_PLAYLIST_SEARCH = 'http://search.kuwo.cn/r.s';
const KUWO_PLAYLIST_INFO = 'http://nplserver.kuwo.cn/pl.svc';
const KUWO_PLAYLIST_INFO_ALT = 'http://www.kuwo.cn/api/www/playlist/playListInfo';
const KUWO_RCM_PLAYLIST = 'http://wapi.kuwo.cn/api/pc/classify/playlist/getRcmPlayList';
const KUWO_QUALITY_LADDER = ['128kmp3', '320kmp3', 'flac', '2000kflac'];
const KUWO_PLAY_TIMEOUT_MS = 8000;
const KUWO_PROBE_TIMEOUT_MS = 2500;

function randomKwToken() {
  return crypto.randomBytes(8).toString('hex');
}

function randomIp() {
  // music-lib sends a random X-Forwarded-For on EVERY Kuwo request
  // (utils.WithRandomIPHeader); without it the WAF answers "The request is illegal!".
  return [Math.floor(Math.random() * 223) + 1, Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256), Math.floor(Math.random() * 254) + 1].join('.');
}

function kuwoHeaders(extra) {
  const token = randomKwToken();
  const ip = randomIp();
  return Object.assign({
    'User-Agent': KUWO_UA,
    Referer: KUWO_REFERER,
    Cookie: 'kw_token=' + token,
    csrf: token,
    'X-Forwarded-For': ip,
    'X-Real-IP': ip,
  }, extra || {});
}

// Plain GET with redirect following (mobi.s may 302 to the audio file).
function kuwoGet(targetUrl, opts) {
  opts = opts || {};
  const timeoutMs = opts.timeoutMs || KUWO_PLAY_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects == null ? 3 : opts.maxRedirects;
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(targetUrl); } catch (e) { reject(e); return; }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method: 'GET',
      headers: opts.headers || kuwoHeaders(),
    }, (res) => {
      const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && loc && maxRedirects > 0) {
        res.resume();
        kuwoGet(new URL(loc, url).toString(), Object.assign({}, opts, { maxRedirects: maxRedirects - 1 }))
          .then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf8'),
      }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('kuwo request timeout')));
    req.on('error', reject);
    req.end();
  });
}

function parseJSONText(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

// Probe a candidate audio URL: Range-fetch the first bytes, require a media
// response (200/206 + non-text content-type). Mirrors probePlaybackAudioUrl.
async function probeKuwoAudioUrl(audioUrl) {
  try {
    const u = new URL(audioUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const ok = await new Promise((resolve) => {
      const req = lib.request(u, {
        method: 'GET',
        headers: { 'User-Agent': KUWO_UA, Referer: KUWO_REFERER, Range: 'bytes=0-1023' },
      }, (res) => {
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        const good = (res.statusCode === 200 || res.statusCode === 206)
          && ct.indexOf('text/') !== 0 && ct.indexOf('application/json') !== 0;
        res.resume();
        resolve(good);
      });
      req.setTimeout(KUWO_PROBE_TIMEOUT_MS, () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
      req.end();
    });
    return ok;
  } catch (e) { return false; }
}

function kuwoRid(raw) {
  const s = String(raw || '').trim();
  return s.replace(/^MUSIC_/i, '');
}

function upgradeKuwoCover(pic) {
  if (!pic) return '';
  return String(pic).replace(/_\d+\.jpg$/i, '_700.jpg');
}

function decodeKuwoEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function mapKuwoSearchItem(item) {
  if (!item || typeof item !== 'object') return null;
  const rid = kuwoRid(item.MUSICRID || item.musicrid || item.rid || item.id);
  if (!rid) return null;
  // NOTE: do NOT filter on bitSwitch — on the r.s legacy endpoint it is 0
  // for ordinary playable tracks. The play-URL probe is the real gate.
  const duration = parseFloat(item.DURATION || item.duration || item.songTimeMinutes || 0);
  return {
    provider: 'kuwo',
    id: rid,
    rid,
    name: decodeKuwoEntities(item.NAME || item.name || item.songname || ''),
    artist: decodeKuwoEntities(item.ARTIST || item.artist || ''),
    album: decodeKuwoEntities(item.ALBUM || item.album || ''),
    duration: Number.isFinite(duration) ? duration : 0,
    pic: upgradeKuwoCover(item.pic || item.pic120 || item.albumpic || item.web_albumpic_short || ''),
    formats: item.MINFO || item.minfo || '',
  };
}

async function handleKuwoSearch(keywords, limit, cookie, offset) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const rn = Math.max(4, Math.min(50, parseInt(limit, 10) || 12));
  const pn = Math.floor((offset || 0) / rn);
  // Primary: legacy search.kuwo.cn/r.s with ft=music — the endpoint the
  // reference implementation (music-lib) actually uses. The www JSON search
  // endpoint answers "The request is illegal!" without a server-issued token.
  try {
    const url = KUWO_PLAYLIST_SEARCH + '?all=' + encodeURIComponent(kw)
      + '&ft=music&itemset=web_2013&client=kt&pcmp4=1&geo=c&vipver=1'
      + '&pn=' + pn + '&rn=' + rn + '&rformat=json&encoding=utf8';
    const res = await kuwoGet(url, { timeoutMs: 8000 });
    const body = parseJSONText(res.text.replace(/'/g, '"'));
    const list = (body && (body.abslist || body.list)) || [];
    const songs = list.map(mapKuwoSearchItem).filter(Boolean);
    if (songs.length) return songs;
  } catch (e) { /* fall through to www endpoint */ }
  // Fallback: www JSON search endpoint.
  const url = KUWO_SEARCH_URL + '?key=' + encodeURIComponent(kw)
    + '&pn=' + (pn + 1) + '&rn=' + rn + '&httpsStatus=1&reqId=' + crypto.randomBytes(8).toString('hex');
  const res = await kuwoGet(url, { timeoutMs: 8000 });
  const body = parseJSONText(res.text);
  const list = (body && body.data && (body.data.list || body.data.musicList)) || [];
  return list.map(mapKuwoSearchItem).filter(Boolean);
}

function parseMobiPlayUrl(text) {
  if (!text) return '';
  const body = parseJSONText(text);
  if (body) {
    if (typeof body.url === 'string' && body.url) return body.url;
    if (body.data && typeof body.data.url === 'string' && body.data.url) return body.data.url;
    if (typeof body.data === 'string' && body.data) return body.data;
  }
  const t = text.trim();
  if (/^https?:\/\//i.test(t) && t.indexOf(' ') < 0) return t;
  return '';
}

async function handleKuwoSongUrl(params, cookie) {
  const rid = kuwoRid(params && (params.rid || params.id || params.musicId || params.mid));
  if (!rid) return { provider: 'kuwo', url: '', playable: false, reason: 'missing_id' };
  const user = 'C_APK_guanwang_' + Date.now() + String(Math.floor(Math.random() * 900000) + 100000);
  let lastError = '';
  for (const br of KUWO_QUALITY_LADDER) {
    try {
      const url = KUWO_PLAY_MOBI + '?f=web&source=kwplayercar_ar_6.0.0.9_B_jiakong_vh.apk'
        + '&from=PC&type=convert_url_with_sign&br=' + br
        + '&rid=' + encodeURIComponent(rid) + '&user=' + encodeURIComponent(user);
      const res = await kuwoGet(url, { timeoutMs: KUWO_PLAY_TIMEOUT_MS });
      const audioUrl = parseMobiPlayUrl(res.text);
      if (!audioUrl) { lastError = 'empty_url_' + br; continue; }
      if (await probeKuwoAudioUrl(audioUrl)) {
        return { provider: 'kuwo', url: audioUrl, playable: true, quality: br, rid };
      }
      lastError = 'probe_failed_' + br;
    } catch (e) { lastError = e.message || 'mobi_failed'; }
  }
  // Fallback: web playUrl endpoint (needs the kuwo web secret header).
  try {
    const url = KUWO_PLAY_WEB + '?mid=' + encodeURIComponent(rid) + '&type=music&httpsStatus=1';
    const res = await kuwoGet(url, {
      timeoutMs: KUWO_PLAY_TIMEOUT_MS,
      headers: kuwoHeaders({ Secret: 'kuwo_web_secret' }),
    });
    const body = parseJSONText(res.text);
    const audioUrl = (body && body.data && body.data.url) || (body && body.url) || '';
    if (audioUrl && await probeKuwoAudioUrl(audioUrl)) {
      return { provider: 'kuwo', url: audioUrl, playable: true, quality: 'web', rid };
    }
    if (!audioUrl) lastError = 'web_empty_url';
    else lastError = 'web_probe_failed';
  } catch (e) { lastError = e.message || 'web_failed'; }
  // No playable URL on any quality: treat as copyright/unavailable, same
  // classification as the QQ adapter (never return a dead URL).
  return { provider: 'kuwo', url: '', playable: false, reason: 'copyright_unavailable', detail: lastError, rid };
}

function kuwoTimeToLrc(timeStr) {
  const sec = parseFloat(timeStr);
  if (!Number.isFinite(sec)) return null;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const mm = String(m).padStart(2, '0');
  const ss = s.toFixed(2).padStart(5, '0');
  return '[' + mm + ':' + ss + ']';
}

async function handleKuwoLyric(rid) {
  const id = kuwoRid(rid);
  if (!id) return { provider: 'kuwo', lyric: '', lrc: '', hasLyric: false };
  const url = KUWO_SONGINFO_LRC + '?musicId=' + encodeURIComponent(id) + '&httpsStatus=1';
  const res = await kuwoGet(url, { timeoutMs: 8000 });
  const body = parseJSONText(res.text);
  const lrclist = (body && body.data && body.data.lrclist) || [];
  const lines = lrclist
    .map((row) => {
      const tag = kuwoTimeToLrc(row.time);
      if (!tag) return null;
      return tag + (row.lineLyric || '');
    })
    .filter(Boolean);
  const lrc = lines.join('\n');
  return { provider: 'kuwo', lyric: lrc, lrc, hasLyric: lines.length > 0 };
}

async function handleKuwoPlaylistSearch(keywords, limit) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const url = KUWO_PLAYLIST_SEARCH + '?all=' + encodeURIComponent(kw)
    + '&ft=playlist&itemset=web_2013&client=kt&pcmp4=1&geo=c&vipver=1&pn=1&rn=' + Math.max(4, Math.min(30, parseInt(limit, 10) || 12))
    + '&rformat=json&encoding=utf8';
  const res = await kuwoGet(url, { timeoutMs: 8000 });
  // Quirk: this endpoint returns malformed JSON with single quotes.
  const body = parseJSONText(res.text.replace(/'/g, '"'));
  const list = (body && (body.abslist || body.list)) || [];
  return list.map((p) => ({
    provider: 'kuwo',
    id: String(p.playlistid || p.id || p.pid || ''),
    name: p.name || p.title || '',
    cover: upgradeKuwoCover(p.pic || p.img || ''),
    playCount: p.playcnt || 0,
  })).filter((p) => p.id && p.name);
}

function mapKuwoPlaylistTrack(item) {
  if (!item || typeof item !== 'object') return null;
  const rid = kuwoRid(item.musicrid || item.MUSICRID || item.rid || item.id);
  if (!rid) return null;
  const duration = parseFloat(item.duration || item.DURATION || 0);
  return {
    provider: 'kuwo',
    id: rid,
    rid,
    name: decodeKuwoEntities(item.name || item.NAME || item.songname || ''),
    artist: decodeKuwoEntities(item.artist || item.ARTIST || ''),
    album: decodeKuwoEntities(item.album || item.ALBUM || ''),
    duration: Number.isFinite(duration) ? duration : 0,
    pic: upgradeKuwoCover(item.pic || item.albumpic || ''),
  };
}

async function handleKuwoPlaylistTracks(playlistId, cookie, opts) {
  const pid = String(playlistId || '').trim();
  if (!pid) return { tracks: [], total: 0 };
  const pn = Math.floor(((opts && opts.offset) || 0) / 100); // nplserver pn is 0-based (music-lib starts at page 0)
  const rn = 100;
  // Primary: nplserver getlistinfo.
  try {
    const url = KUWO_PLAYLIST_INFO + '?op=getlistinfo&pid=' + encodeURIComponent(pid)
      + '&pn=' + pn + '&rn=' + rn + '&encode=utf8&keyset=pl2012&identity=kuwo&pcmp4=1&vipver=1&newver=1';
    const res = await kuwoGet(url, { timeoutMs: 8000 });
    const body = parseJSONText(res.text);
    const list = (body && (body.musiclist || body.list)) || [];
    const tracks = list.map(mapKuwoPlaylistTrack).filter(Boolean);
    if (tracks.length) return { tracks, total: body.total || tracks.length };
  } catch (e) { /* fall through to alt endpoint */ }
  try {
    const url = KUWO_PLAYLIST_INFO_ALT + '?pid=' + encodeURIComponent(pid)
      + '&pn=' + pn + '&rn=' + rn + '&httpsStatus=1';
    const res = await kuwoGet(url, { timeoutMs: 8000 });
    const body = parseJSONText(res.text);
    const list = (body && body.data && (body.data.musicList || body.data.list)) || [];
    const tracks = list.map(mapKuwoPlaylistTrack).filter(Boolean);
    return { tracks, total: (body.data && body.data.total) || tracks.length };
  } catch (e) {
    return { tracks: [], total: 0, error: e.message };
  }
}

async function handleKuwoGuessLike(cookie, limit) {
  const rn = Math.max(4, Math.min(30, parseInt(limit, 10) || 12));
  const url = KUWO_RCM_PLAYLIST + '?pn=0&rn=' + rn + '&order=hot';
  const res = await kuwoGet(url, { timeoutMs: 8000 });
  const body = parseJSONText(res.text);
  const list = (body && body.data && (body.data.data || body.data.list)) || (body && body.data) || [];
  const playlists = (Array.isArray(list) ? list : []).map((p) => ({
    provider: 'kuwo',
    id: String(p.id || p.playlistid || p.pid || ''),
    name: p.name || p.title || '',
    cover: upgradeKuwoCover(p.pic || p.img || ''),
  })).filter((p) => p.id && p.name);
  return { provider: 'kuwo', playlists };
}

// Kuwo has no documented user-library endpoint (my playlists / liked songs).
// Honest answer: unsupported for now, do not fake it.
function handleKuwoUserPlaylists() {
  return { provider: 'kuwo', playlists: [], supported: false, error: 'KUWO_LIBRARY_UNSUPPORTED' };
}

function getKuwoLoginInfo() {
  return {
    provider: 'kuwo',
    loggedIn: false,
    loginSupported: false,
    message: '酷我暂不支持账号登录同步：可搜索、播歌、看歌词和公开歌单，个人歌单暂不支持。',
  };
}

function kuwoAudioReferer(audioUrl) {
  try {
    const host = new URL(audioUrl).hostname.toLowerCase();
    if (host.indexOf('kuwo.cn') >= 0) return KUWO_REFERER;
  } catch (e) {}
  return '';
}

module.exports = {
  handleKuwoSearch,
  handleKuwoSongUrl,
  handleKuwoLyric,
  handleKuwoGuessLike,
  handleKuwoPlaylistSearch,
  handleKuwoPlaylistTracks,
  handleKuwoUserPlaylists,
  getKuwoLoginInfo,
  kuwoAudioReferer,
};
