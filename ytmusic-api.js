'use strict';

// YouTube Music adapter — fork addition for all-in-one-player v2.0.0.
// Uses the youtubei.js library (Innertube API, no key needed) for search,
// full-length audio streams, lyrics (plain text) and public playlists.
// Stream URLs are signed, ~6h expiry and IP-bound: resolve fresh on every
// play, never persist. ANDROID_VR is the PoToken-free client for stream
// resolution (the pattern used by the Mineradio fork that runs on YTM).
// Library sync needs a signed-in music.youtube.com cookie (harvested from an
// Electron login window); without it, library endpoints return login_required.

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Innertube } = require('youtubei.js');

const YTMUSIC_STREAM_CLIENTS = ['ANDROID_VR', 'ANDROID', 'TV', 'IOS'];
const YTMUSIC_PROBE_TIMEOUT_MS = 3000;
const YTMUSIC_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const YTMUSIC_COOKIE_FILE = process.env.YTMUSIC_COOKIE_FILE
  || path.join(__dirname, '.ytmusic-cookie');

let ytPromise = null;
let ytCookieUsed = '';

function readYtCookie() {
  try { return fs.readFileSync(YTMUSIC_COOKIE_FILE, 'utf8').trim(); } catch (e) { return ''; }
}

function getYt() {
  const cookie = readYtCookie();
  if (!ytPromise || ytCookieUsed !== cookie) {
    ytCookieUsed = cookie;
    ytPromise = (async () => {
      try {
        return await Innertube.create(cookie ? { cookie } : {});
      } catch (e) {
        // If the cookie option is rejected, fall back to an anonymous session.
        if (cookie) return Innertube.create();
        throw e;
      }
    })().catch((e) => { ytPromise = null; throw e; });
  }
  return ytPromise;
}

function textOf(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (typeof t.text === 'string') return t.text;
  if (Array.isArray(t.runs)) return t.runs.map((r) => r.text || '').join('');
  return '';
}

function thumbOf(item) {
  const thumbs = item && (item.thumbnails || (item.thumbnail && item.thumbnail.thumbnails)
    || (item.content_image && item.content_image.image));
  if (Array.isArray(thumbs) && thumbs.length) return thumbs[thumbs.length - 1].url || '';
  return '';
}

function ytmArtistFromMetadata(v) {
  try {
    const rows = v && v.metadata && v.metadata.metadata && v.metadata.metadata.metadata_rows;
    if (Array.isArray(rows) && rows[0] && Array.isArray(rows[0].metadata_parts)) {
      return rows[0].metadata_parts.map((p) => textOf(p.text)).filter(Boolean).join(' ');
    }
  } catch (e) {}
  return '';
}

function mapYtmSong(item) {
  if (!item || typeof item !== 'object') return null;
  const id = item.id || (item.endpoint && item.endpoint.payload && item.endpoint.payload.videoId) || '';
  if (!id) return null;
  const artists = Array.isArray(item.artists)
    ? item.artists.map((a) => a && a.name).filter(Boolean)
    : (item.author ? [textOf(item.author)] : []);
  return {
    provider: 'ytmusic',
    id,
    videoId: id,
    name: textOf(item.title) || '',
    artist: artists.join(', '),
    artists,
    album: textOf(item.album) || '',
    duration: (item.duration && item.duration.seconds) || 0,
    pic: thumbOf(item),
  };
}

async function handleYtmSearch(keywords, limit, cookie, offset) {
  const q = String(keywords || '').trim();
  if (!q) return [];
  const yt = await getYt();
  const result = await yt.music.search(q, { type: 'song' });
  const contents = (result.songs && result.songs.contents) || result.contents || [];
  const songs = contents.map(mapYtmSong).filter(Boolean);
  const n = Math.max(4, Math.min(50, parseInt(limit, 10) || 12));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  return songs.slice(off, off + n);
}

async function handleYtmPlaylistSearch(keywords, limit) {
  const q = String(keywords || '').trim();
  if (!q) return [];
  const yt = await getYt();
  const result = await yt.music.search(q, { type: 'playlist' });
  const contents = (result.playlists && result.playlists.contents) || result.contents || [];
  const n = Math.max(4, Math.min(30, parseInt(limit, 10) || 12));
  return contents.slice(0, n).map((p) => ({
    provider: 'ytmusic',
    id: p.id || '',
    name: textOf(p.title) || '',
    cover: thumbOf(p),
    author: textOf(p.author) || '',
  })).filter((p) => p.id && p.name);
}

async function probeYtmAudioUrl(audioUrl) {
  try {
    const u = new URL(audioUrl);
    const lib = u.protocol === 'https:' ? https : http;
    return await new Promise((resolve) => {
      const req = lib.request(u, {
        method: 'GET',
        headers: { 'User-Agent': YTMUSIC_UA, Range: 'bytes=0-1023' },
      }, (res) => {
        const ct = String(res.headers['content-type'] || '').toLowerCase();
        const good = (res.statusCode === 200 || res.statusCode === 206)
          && ct.indexOf('text/') !== 0 && ct.indexOf('application/json') !== 0;
        res.resume();
        resolve(good);
      });
      req.setTimeout(YTMUSIC_PROBE_TIMEOUT_MS, () => { req.destroy(); resolve(false); });
      req.on('error', () => resolve(false));
      req.end();
    });
  } catch (e) { return false; }
}

async function handleYtmSongUrl(params, cookie) {
  const videoId = String((params && (params.videoId || params.id || params.rid)) || '').trim();
  if (!videoId) return { provider: 'ytmusic', url: '', playable: false, reason: 'missing_id' };
  const yt = await getYt();
  let lastError = '';
  for (const client of YTMUSIC_STREAM_CLIENTS) {
    try {
      const info = await yt.getInfo(videoId, { client });
      const formats = (info.streaming_data && info.streaming_data.adaptive_formats) || [];
      const audio = formats
        .filter((f) => f.mime_type && f.mime_type.indexOf('audio/') === 0 && f.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (!audio.length) { lastError = 'no_audio_format_' + client; continue; }
      for (const fmt of audio.slice(0, 3)) {
        if (await probeYtmAudioUrl(fmt.url)) {
          return {
            provider: 'ytmusic', url: fmt.url, playable: true,
            quality: fmt.mime_type, bitrate: fmt.bitrate || 0,
            videoId, client,
          };
        }
      }
      lastError = 'probe_failed_' + client;
    } catch (e) { lastError = e.message || ('client_failed_' + client); }
  }
  return { provider: 'ytmusic', url: '', playable: false, reason: 'url_unavailable', detail: lastError, videoId };
}

async function handleYtmLyric(videoId) {
  const id = String(videoId || '').trim();
  if (!id) return { provider: 'ytmusic', lyric: '', lrc: '', hasLyric: false, synced: false };
  try {
    const yt = await getYt();
    const shelf = await yt.music.getLyrics(id);
    const text = shelf && shelf.description ? textOf(shelf.description) : '';
    return { provider: 'ytmusic', lyric: text, lrc: '', hasLyric: text.trim().length > 0, synced: false };
  } catch (e) {
    return { provider: 'ytmusic', lyric: '', lrc: '', hasLyric: false, synced: false, error: e.message };
  }
}

async function handleYtmPlaylistTracks(playlistId, cookie, opts) {
  const id = String(playlistId || '').trim();
  if (!id) return { tracks: [], total: 0 };
  const yt = await getYt();
  const playlist = await yt.getPlaylist(id);
  const items = playlist.items || [];
  const tracks = items.map((v) => {
    if (!v || typeof v !== 'object') return null;
    // Playlist items come back as LockupView (content_id + metadata.title),
    // not PlaylistVideo (id + title) — handle both shapes.
    const videoId = v.content_id || v.id || v.video_id || '';
    if (!videoId) return null;
    const artists = Array.isArray(v.artists)
      ? v.artists.map((a) => a && a.name).filter(Boolean)
      : (v.author ? [textOf(v.author)] : []);
    const metaArtist = ytmArtistFromMetadata(v);
    return {
      provider: 'ytmusic',
      id: videoId,
      videoId,
      name: textOf(v.title) || textOf(v.metadata && v.metadata.title) || '',
      artist: artists.join(', ') || metaArtist,
      duration: (v.duration && v.duration.seconds) || 0,
      pic: thumbOf(v),
    };
  }).filter(Boolean);
  return { tracks, total: tracks.length, title: textOf(playlist.title) || textOf(playlist.info && playlist.info.title) || '' };
}

// Library needs a signed-in session; without a harvested cookie, say so.
function getYtmLoginInfo() {
  const cookie = readYtCookie();
  return {
    provider: 'ytmusic',
    loggedIn: !!cookie,
    loginSupported: true,
    message: cookie
      ? 'YouTube Music 已登录（Cookie 会话）。'
      : 'YouTube Music 未登录：可搜索和播放公开内容，个人曲库需登录。',
  };
}

function handleYtmUserPlaylists() {
  if (!readYtCookie()) {
    return { provider: 'ytmusic', playlists: [], supported: false, error: 'YTMUSIC_AUTH_REQUIRED' };
  }
  return { provider: 'ytmusic', playlists: [], supported: false, error: 'YTMUSIC_LIBRARY_UNVERIFIED' };
}

function ytmusicAudioReferer(audioUrl) {
  try {
    const host = new URL(audioUrl).hostname.toLowerCase();
    if (host.indexOf('googlevideo.com') >= 0 || host.indexOf('youtube.com') >= 0) {
      return 'https://music.youtube.com/';
    }
  } catch (e) {}
  return '';
}

function writeYtmCookie(cookie) {
  try {
    fs.writeFileSync(YTMUSIC_COOKIE_FILE, String(cookie || ''), 'utf8');
    ytPromise = null;
    ytCookieUsed = '';
    return true;
  } catch (e) { return false; }
}

module.exports = {
  handleYtmSearch,
  handleYtmSongUrl,
  handleYtmLyric,
  handleYtmPlaylistSearch,
  handleYtmPlaylistTracks,
  handleYtmUserPlaylists,
  getYtmLoginInfo,
  ytmusicAudioReferer,
  writeYtmCookie,
  readYtCookie,
};
