/* Apple Music — Tier A (catalog search + 30s previews).
   Fork addition (v2.0.0). The user chose NOT to embed the Apple web player
   (that would need the whole app to switch to CastLabs Electron for Widevine),
   so Apple here is honest catalog + preview only: iTunes Search API is free,
   needs no key, no login, and returns metadata + a 30-second previewUrl.
   There is NO full-track playback, NO library, NO login in this tier — the
   login/status route says so explicitly instead of faking "connected". */
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ITUNES_SEARCH = 'https://itunes.apple.com/search';
const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function upgradeArtwork(u) {
  if (!u) return '';
  return String(u).replace('100x100bb.jpg', '600x600bb.jpg').replace('100x100bb.png', '600x600bb.png');
}

function mapTrack(t) {
  if (!t || !t.trackId) return null;
  return {
    provider: 'apple',
    id: String(t.trackId),
    trackId: String(t.trackId),
    name: t.trackName || '',
    artist: t.artistName || '',
    album: t.collectionName || '',
    duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 0,
    pic: upgradeArtwork(t.artworkUrl100 || ''),
    previewUrl: t.previewUrl || '',
    preview: true,
    isPreview: true,
  };
}

async function handleAppleSearch(keywords, limit) {
  const q = String(keywords || '').trim();
  if (!q) return { songs: [] };
  const n = Math.max(1, Math.min(50, Number(limit) || 25));
  const url = ITUNES_SEARCH + '?term=' + encodeURIComponent(q)
    + '&media=music&entity=song&limit=' + n + '&country=US';
  const body = await fetchJson(url, 8000);
  const songs = ((body && body.results) || []).map(mapTrack).filter(Boolean);
  return { songs, total: songs.length };
}

async function handleAppleSongUrl(trackId) {
  const id = String(trackId || '').trim();
  if (!id) return { playable: false, reason: 'missing_id' };
  const body = await fetchJson(ITUNES_LOOKUP + '?id=' + encodeURIComponent(id) + '&entity=song', 8000);
  const t = (body && body.results && body.results[0]) || null;
  const previewUrl = t && t.previewUrl;
  if (!previewUrl) return { playable: false, reason: 'url_unavailable', detail: 'Apple 未提供这首歌的试听' };
  return {
    playable: true,
    url: previewUrl,
    provider: 'apple',
    preview: true,
    trial: true,
    trialText: 'Apple Music 试听 · 仅播放 30 秒片段',
    loginSupported: false,
    duration: 30,
    name: t.trackName || '',
    artist: t.artistName || '',
  };
}

function getAppleLoginInfo() {
  return {
    provider: 'apple',
    loggedIn: false,
    loginSupported: false,
    message: 'Apple Music 暂不支持账号登录同步：可搜索曲库、试听 30 秒，整首播放需在 Apple Music App 内完成。',
  };
}

function appleAudioReferer(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (host.includes('itunes.apple.com') || host.includes('audio-ssl.itunes.apple.com') || host.includes('mzstatic.com')) {
      return 'https://music.apple.com/';
    }
  } catch (e) {}
  return '';
}

module.exports = {
  handleAppleSearch,
  handleAppleSongUrl,
  getAppleLoginInfo,
  appleAudioReferer,
};
