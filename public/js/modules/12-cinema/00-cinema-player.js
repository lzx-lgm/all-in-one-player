/* Cinema — 全能影院 (fork addition, v2.0.0; v2.0.3 影院重做；v2.0.4 真音乐 MV；v2.0.5 MV 再加 YouTube Music)。
   不再是浏览器播放器外观：自绘放映控制台（播控条/音量/进度/氛围光/放映单），
   影院氛围光 + 跑马灯片名 + 胶片齿孔进度条。
   放映单是真音乐 MV（网易云音乐 + YouTube Music，/api/mv/*：搜 MV + 最新 MV，列表拉回来先逐
   个探播放地址、只留能播的再展示）；MV 服务连不上时回落到 8 个演示片段，绝不空着。
   声音走“影院专线”：桌面版把视频音频接进一条独立的 AudioContext（和音乐
   一样的 Web Audio 通路、同一个输出设备），不再只依赖 <video> 元素自身
   的输出——v2.0.2 的 setSinkId 修不好的无声问题，根子就在元素级输出上。
   网页版因跨域 CORS 无法保证，走元素直出（行为与原来一致）。
   原理照 PotPlayer：自带解码兜底 + 字幕/音轨/A-B/逐帧/画面调节/截图/媒体信息；
   浏览器 <video> 解不了 AC3/DTS 等音频时，桌面版给「用系统播放器打开」兜底。
   防御式加载：任何一步出错都不应拖垮整站启动（index-loader 是串联加载）。 */
(function () {
  'use strict';
  try { initCinema(); } catch (e) { /* cinema is optional; never break boot */ }

  function initCinema() {
    if (window.__cinemaLoaded) return;
    window.__cinemaLoaded = true;
    if (typeof document === 'undefined' || !document.body) return;

    var IS_DESKTOP = !!(window.desktopWindow && window.desktopWindow.isDesktop);
    var DW = window.desktopWindow || null;
    /* 桌面版：所有远程视频都经本机 /api/video 代理（同源），本地是 blob；
       同源才能安全接进 Web Audio，跨域没 CORS 会直接静音，所以网页版不走专线。 */
    var USE_WEB_AUDIO = IS_DESKTOP;

    var DEMO_MVS = [
      { title: 'For Bigger Fun — 欢乐大片', artist: '演示 MV', plat: 'YouTube Music', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4' },
      { title: 'For Bigger Blazes — 火焰时刻', artist: '演示 MV', plat: 'QQ音乐', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
      { title: 'Big Buck Bunny — 森林物语', artist: '演示 MV', plat: 'Spotify', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4' },
      { title: 'Elephants Dream — 梦境', artist: '演示 MV', plat: 'Apple Music', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4' },
      { title: 'For Bigger Escapes — 逃离计划', artist: '演示 MV', plat: '网易云音乐', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4' },
      { title: 'For Bigger Joyrides — 兜风', artist: '演示 MV', plat: '酷狗音乐', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4' },
      { title: 'Sintel — 寻龙少女', artist: '演示 MV · 汽水热播', plat: '汽水音乐', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4' },
      { title: 'Tears of Steel — 钢铁之泪', artist: '演示 MV', plat: '酷我音乐', src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4' },
    ];

    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    }
    function $(id) { return document.getElementById(id); }
    function fmt(t) {
      t = Math.max(0, t || 0);
      var m = Math.floor(t / 60), s = Math.floor(t % 60);
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    function fileSizeMB(f) { return (f.size / 1048576).toFixed(2) + ' MB'; }
    function extOf(src) {
      var m = String(src).split('?')[0].match(/\.([a-z0-9]+)$/i);
      return m ? m[1].toUpperCase() : 'MP4';
    }
    function proxiedVideoUrl(u) {
      if (!u || u.indexOf('blob:') === 0 || u.indexOf('data:') === 0) return u;
      return IS_DESKTOP ? '/api/video?url=' + encodeURIComponent(u) : u;
    }
    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    /* ---------- styles (inline: no index.html edits) ---------- */
    var style = el('style');
    style.textContent = [
      '.cin-btn{position:fixed;right:18px;bottom:18px;z-index:9990;padding:11px 18px;border-radius:999px;border:1px solid rgba(167,139,250,.55);background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 24px rgba(124,58,237,.45)}',
      '.cin-btn:hover{filter:brightness(1.12)}',
      '.cin-overlay{position:fixed;inset:0;z-index:9991;background:radial-gradient(1200px 600px at 50% -10%,rgba(124,58,237,.28),transparent 60%),radial-gradient(900px 500px at 85% 110%,rgba(6,182,212,.18),transparent 60%),rgba(2,2,8,.94);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:22px 12px 40px}',
      '.cin-panel{width:min(1060px,96vw);background:linear-gradient(180deg,#14101f,#0b0b14);border:1px solid rgba(167,139,250,.35);border-radius:18px;padding:18px 18px 14px;color:#eee;font-size:14px;box-shadow:0 24px 80px rgba(0,0,0,.6)}',
      '.cin-close{float:right;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer}',
      '.cin-marquee{overflow:hidden;white-space:nowrap;border-bottom:1px solid rgba(167,139,250,.3);padding:2px 0 8px;margin-bottom:12px}',
      '.cin-marquee span{display:inline-block;padding-left:100%;animation:cin-marquee 26s linear infinite;font-size:16px;font-weight:600;letter-spacing:1px;color:#e9e4ff}',
      '@keyframes cin-marquee{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}',
      '.cin-screenwrap{position:relative;border-radius:14px;overflow:hidden;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 18px 60px rgba(124,58,237,.25)}',
      '.cin-ambient{position:absolute;inset:-40px;z-index:0;width:calc(100% + 80px);height:calc(100% + 80px);object-fit:cover;filter:blur(64px) saturate(1.6);opacity:.55;pointer-events:none}',
      '.cin-screen{position:relative;z-index:1}',
      '.cin-screen video{width:100%;max-height:56vh;background:#000;display:block}',
      '.cin-console{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border:1px solid rgba(167,139,250,.3);border-radius:12px;background:rgba(255,255,255,.05)}',
      '.cin-cbtn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:7px 11px;cursor:pointer;font-size:13px;white-space:nowrap}',
      '.cin-cbtn:hover{border-color:#22d3ee}',
      '.cin-cbtn.on{background:#7c3aed;border-color:#22d3ee}',
      '.cin-cbtn.main{background:linear-gradient(135deg,#7c3aed,#06b6d4);border-color:transparent;font-weight:600;padding:7px 16px}',
      '.cin-seek{flex:1;min-width:140px;appearance:none;-webkit-appearance:none;height:12px;border-radius:6px;outline:none;cursor:pointer;background:repeating-linear-gradient(90deg,#3a2f5e 0 10px,#241d3d 10px 22px);border:1px solid rgba(167,139,250,.4)}',
      '.cin-seek::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#22d3ee;border:2px solid #fff;box-shadow:0 0 10px rgba(34,211,238,.8)}',
      '.cin-seek::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#22d3ee;border:2px solid #fff}',
      '.cin-vol{width:90px;appearance:none;-webkit-appearance:none;height:6px;border-radius:3px;background:rgba(255,255,255,.25);outline:none;cursor:pointer}',
      '.cin-vol::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#a78bfa;border:2px solid #fff}',
      '.cin-vol::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:#a78bfa;border:2px solid #fff}',
      '.cin-time{font-size:12.5px;color:#c9c9dd;white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.cin-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}',
      '.cin-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;font-size:12.5px;color:#c9c9dd}',
      '.cin-chip b{color:#fff}',
      '.cin-diag{margin:6px 0;padding:9px 12px;border:1px dashed rgba(34,211,238,.45);border-radius:10px;font-size:12.5px;line-height:1.7;color:#b9f3ff;background:rgba(6,182,212,.06);white-space:pre-wrap}',
      '.cin-diag b{color:#fff}',
      '.cin-pro{display:flex;gap:14px;flex-wrap:wrap;align-items:center;border-top:1px solid rgba(255,255,255,.12);padding-top:10px;margin-top:10px;font-size:13px}',
      '.cin-pro b{color:#fff}',
      '.cin-tbtn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px}',
      '.cin-tbtn.on{background:#7c3aed;border-color:#22d3ee}',
      '.cin-note{color:#9a9ab0;font-size:12px}',
      '.cin-info{margin-top:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.16);border-radius:10px;font-size:12.5px;line-height:1.8;color:#b9b9cc;white-space:pre-wrap}',
      '.cin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:10px}',
      '.cin-item{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;overflow:hidden;cursor:pointer;text-align:left;padding:0;color:#eee}',
      '.cin-item.playing{border-color:#22d3ee;box-shadow:0 0 0 1px #22d3ee,0 0 18px rgba(34,211,238,.35)}',
      '.cin-item video{width:100%;height:96px;object-fit:cover;display:block;background:#000}',
      '.cin-item .mi{padding:8px}',
      '.cin-item .mi b{display:block;font-size:13px}',
      '.cin-item .mi span{font-size:12px;color:#9a9ab0}',
      '.cin-drop{margin-top:12px;border:1px dashed rgba(167,139,250,.5);border-radius:10px;padding:14px;text-align:center;color:#b9b9cc;font-size:13px}',
      '.cin-drop.drag{border-color:#22d3ee;background:rgba(34,211,238,.1)}',
      '.cin-urlrow{display:flex;gap:8px;margin-top:10px}',
      '.cin-urlrow input{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#fff;padding:8px 10px;font-size:13px}',
      '.cin-hidden{display:none!important}',
    ].join('\n');
    document.head.appendChild(style);

    /* ---------- DOM ---------- */
    var openBtn = el('button', 'cin-btn', '🎬 全能影院');
    openBtn.title = '全能影院：原格式 · 原分辨率 · 不转码';
    document.body.appendChild(openBtn);

    var overlay = el('div', 'cin-overlay cin-hidden');
    var panel = el('div', 'cin-panel');
    panel.innerHTML =
      '<button class="cin-close" id="cinClose">✕ 关闭</button>' +
      '<div class="cin-marquee"><span id="cinTitle">全能影院 — 还没选片，搜个 MV 或点下面的音乐 MV</span></div>' +
      '<div class="cin-screenwrap"><video id="cinAmbientVideo" class="cin-ambient" muted playsinline preload="metadata"></video>' +
      '<div class="cin-screen"><video id="cinVideo" playsinline preload="metadata"></video></div></div>' +
      '<div class="cin-console">' +
      '<button class="cin-cbtn" id="cinPrevBtn" title="上一部">⏮</button>' +
      '<button class="cin-cbtn main" id="cinPlayBtn">▶ 播放</button>' +
      '<button class="cin-cbtn" id="cinNextBtn" title="下一部">⏭</button>' +
      '<input type="range" class="cin-seek" id="cinSeek" min="0" max="1000" value="0" title="进度（胶片齿孔条，点一下就跳）">' +
      '<span class="cin-time" id="cinMetaTime">00:00 / 00:00</span>' +
      '<button class="cin-cbtn" id="cinMuteBtn" title="静音">🔊</button>' +
      '<input type="range" class="cin-vol" id="cinVolSlider" min="0" max="100" value="100" title="影院音量">' +
      '<select id="cinSpeedSel" class="cin-cbtn" title="视频倍速"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1.0× 倍速</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select>' +
      '<button class="cin-cbtn on" id="cinOrigBtn">原始分辨率直通</button>' +
      '<button class="cin-cbtn" id="cinNativeBtn">1:1 原生尺寸</button>' +
      '<button class="cin-cbtn" id="cinAmbientBtn" title="氛围光开关">✨ 氛围光</button>' +
      '<button class="cin-cbtn" id="cinFsBtn">⛶ 全屏</button>' +
      '<button class="cin-cbtn" id="cinPipBtn">画中画</button>' +
      '</div>' +
      '<div class="cin-meta">' +
      '<span class="cin-chip">原始分辨率 <b id="cinMetaRes">—</b></span>' +
      '<span class="cin-chip">原始格式 <b id="cinMetaFmt">—</b></span>' +
      '<span class="cin-chip">来源 <b id="cinMetaSrc">—</b></span>' +
      '<span class="cin-chip">画质 <b id="cinQualitySel">原始（源文件）</b></span>' +
      '<span class="cin-chip">处理 <b>不转码 · 不压缩 · 不裁切</b></span>' +
      '</div>' +
      '<div class="cin-diag" id="cinDiag">声音诊断：还没播放。播起来后这里会实时显示静音/音量/已解码音频/输出设备 — 视频没声就截这张图给我。</div>' +
      '<div style="margin-top:6px"><button class="cin-tbtn" id="cinToneBtn">🔔 播一声测试音</button> <button class="cin-tbtn" id="cinResetOutBtn">恢复默认输出设备</button> <span class="cin-note">测试音走影院同一条声音专线：听见蜂鸣 = 输出通路正常，问题在片源音频；听不见 = 输出设备/通路有问题。</span></div>' +
      '<div style="margin-top:12px"><button class="cin-tbtn" id="cinProToggle">🎛 放映控制 ▾</button></div>' +
      '<div class="cin-pro cin-hidden" id="cinProRow">' +
      '<span><b>字幕</b> <button class="cin-tbtn" id="cinSubBtn">加载字幕文件</button><input type="file" id="cinSubFile" accept=".srt,.vtt,.ass,.ssa" class="cin-hidden"><span class="cin-note" id="cinSubState">未加载</span></span>' +
      '<span><b>音轨</b> <select id="cinAudioTrackSel" class="cin-tbtn" title="多音轨视频切换音轨"><option value="">单音轨</option></select></span>' +
      '<span><b>A-B 循环</b> <button class="cin-tbtn" id="cinAbABtn">设 A 点</button><button class="cin-tbtn" id="cinAbBBtn">设 B 点</button><button class="cin-tbtn" id="cinAbClearBtn">取消</button><span class="cin-note" id="cinAbState"></span></span>' +
      '<span><b>逐帧</b> <button class="cin-tbtn" id="cinFrameBackBtn">◀ 帧</button><button class="cin-tbtn" id="cinFrameFwdBtn">帧 ▶</button></span>' +
      '<span><label><input type="checkbox" id="cinPitchCheck" checked> 变速保音调</label></span>' +
      '<span><b>画面</b> <label>亮度 <input type="range" id="cinFltBright" min="50" max="150" value="100"></label> <label>对比 <input type="range" id="cinFltContrast" min="50" max="150" value="100"></label> <label>饱和 <input type="range" id="cinFltSaturate" min="0" max="200" value="100"></label> <button class="cin-tbtn" id="cinFltResetBtn">还原</button></span>' +
      '<span><button class="cin-tbtn" id="cinShotBtn">📷 截图</button> <button class="cin-tbtn" id="cinMediaInfoBtn">媒体信息</button> <button class="cin-tbtn cin-hidden" id="cinOpenExtBtn">用系统播放器打开</button></span>' +
      '</div>' +
      '<div id="cinMediaInfoPanel" class="cin-info cin-hidden"></div>' +
      '<div class="cin-urlrow"><input id="cinUrlInput" type="text" placeholder="粘贴视频直链（MP4 / WebM…）后点播放"><button class="cin-tbtn" id="cinUrlBtn">播这个链接</button></div>' +
      '<div class="cin-drop" id="cinDropZone">把你自己的视频拖到这里，直接原画播放 <button class="cin-tbtn" id="cinPickBtn" style="margin-left:8px">选择文件</button><input type="file" id="cinLocalFile" accept="video/*,.mkv,.avi,.mov" class="cin-hidden"></div>' +
      '<div class="cin-note" id="cinLocalMeta" style="margin-top:8px"></div>' +
      '<h3 style="margin:14px 0 0;font-size:14px">🎵 音乐 MV <span class="cin-note">— 真 MV，网易云 + YouTube Music；点一张就放，放完自动接下一张</span></h3>' +
      '<div class="cin-urlrow" style="margin-top:8px"><input id="cinMvSearchInput" type="text" placeholder="搜 MV：歌名 / 歌手，比如 晴天 周杰伦"><button class="cin-tbtn" id="cinMvSearchBtn">搜 MV</button><span class="cin-note" id="cinMvNote">正在拉最新 MV…</span></div>' +
      '<div class="cin-grid" id="cinMvGrid"></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var video = $('cinVideo');
    var ambientVideo = $('cinAmbientVideo');
    var status = $('cinLocalMeta');
    var diag = $('cinDiag');
    var currentLocalFile = null, currentLocalFilePath = '', localVideoURL = null;
    var abA = null, abB = null, subTrackEl = null, currentFps = 30;
    var videoAudioTimer = null, videoAudioCheckedSrc = '';
    var currentQueueIndex = -1, seeking = false, cinemaVolume = 1;
    var diagTimer = null;
    /* 影院声音专线：独立 AudioContext，只归影院管，音乐那边的图谱重建碰不到它。
       视频一旦接进 MediaElementSource，声音就只走这条线（元素自身的输出被接管），
       所以专线断了要如实报出来，不能悄悄回落到“以为有声”的状态。 */
    var videoCtx = null, videoSource = null, videoGain = null, videoAudioPath = '未建立';

    function toast(msg) { status.textContent = msg; }
    function pauseHostAudio() {
      try {
        if (typeof audio !== 'undefined' && audio && !audio.paused) audio.pause();
      } catch (e) {}
    }
    function currentOutputDeviceId() {
      try {
        if (typeof audioOutputDeviceId !== 'undefined') return audioOutputDeviceId || '';
      } catch (e) {}
      return '';
    }
    /* 视频跟音乐走同一个输出设备：音乐经 setSinkId 选了输出口，视频默认只走系统默认口，
       两边设备不一致时就会出现“音乐有声、视频没声”。元素级 setSinkId（v2.0.2）+ 专线
       AudioContext 级 setSinkId（v2.0.3）两边都跟随同一选择。 */
    function applyCinemaOutputDevice() {
      var id = currentOutputDeviceId();
      try {
        if (video && typeof video.setSinkId === 'function') {
          var p = video.setSinkId(id);
          if (p && p.catch) p.catch(function () {});
        }
      } catch (e) {}
      try {
        if (videoCtx && typeof videoCtx.setSinkId === 'function') {
          var p2 = videoCtx.setSinkId(id);
          if (p2 && p2.catch) p2.catch(function () {});
        }
      } catch (e) {}
    }
    /* 把视频音频接进影院专线：和音乐一样的 Web Audio 通路。只在桌面版做
       （同源：代理或 blob；网页版跨域没 CORS 会直接静音，宁可不走）。 */
    function ensureVideoAudioPath() {
      if (!USE_WEB_AUDIO) { videoAudioPath = '元素直出（网页版）'; return false; }
      if (videoCtx && videoCtx.state === 'closed') { videoCtx = null; videoSource = null; videoGain = null; }
      if (videoSource) return true;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { videoAudioPath = '元素直出（无 AudioContext）'; return false; }
        if (!videoCtx) videoCtx = new AC();
        if (videoCtx.state === 'suspended') videoCtx.resume().catch(function () {});
        videoGain = videoCtx.createGain();
        videoGain.gain.value = cinemaVolume;
        videoGain.connect(videoCtx.destination);
        videoSource = videoCtx.createMediaElementSource(video);
        videoSource.connect(videoGain);
        applyCinemaOutputDevice();
        videoAudioPath = 'Web Audio 影院专线';
        return true;
      } catch (e) {
        videoSource = null; videoGain = null;
        videoAudioPath = '专线建立失败 → 元素直出（' + (e && e.message ? e.message : '未知原因') + '）';
        return false;
      }
    }
    function updateDiag() {
      try {
        var dec = null;
        try { dec = video.webkitAudioDecodedByteCount; } catch (e) {}
        var sink = currentOutputDeviceId();
        diag.textContent =
          '声音诊断：' + (video.paused ? '已暂停' : '播放中') +
          ' · 静音=' + (video.muted ? '是' : '否') +
          ' · 音量=' + Math.round((video.volume == null ? 1 : video.volume) * 100) + '%' +
          ' · 已解码音频=' + (dec == null ? '未知' : dec + ' 字节' + (dec === 0 && !video.paused ? '（0 = 片源无声或编码不受支持）' : '')) +
          '\n声音通路：' + videoAudioPath +
          ' · 输出设备：' + (sink ? '已选设备（id ' + String(sink).slice(0, 12) + '…）' : '系统默认') +
          (video.audioTracks && video.audioTracks.length > 1 ? ' · 音轨数=' + video.audioTracks.length : '');
      } catch (e) {}
    }
    function startDiagTimer() {
      stopDiagTimer();
      updateDiag();
      diagTimer = setInterval(updateDiag, 1000);
    }
    function stopDiagTimer() {
      if (diagTimer) { clearInterval(diagTimer); diagTimer = null; }
    }
    function resetVideoPro() {
      abA = null; abB = null;
      $('cinAbState').textContent = '';
      if (subTrackEl) { try { subTrackEl.remove(); } catch (e) {} subTrackEl = null; $('cinSubState').textContent = '未加载'; }
      $('cinMediaInfoPanel').classList.add('cin-hidden');
      $('cinMediaInfoPanel').textContent = '';
      video.style.filter = '';
      $('cinFltBright').value = 100; $('cinFltContrast').value = 100; $('cinFltSaturate').value = 100;
      $('cinAudioTrackSel').innerHTML = '<option value="">单音轨</option>';
    }
    function checkVideoAudio() {
      if (videoAudioTimer) clearTimeout(videoAudioTimer);
      var src = video.currentSrc || '';
      videoAudioTimer = setTimeout(function () {
        if (!src || video.currentSrc !== src || video.paused || video.ended) return;
        try {
          var n = video.webkitAudioDecodedByteCount;
          if (typeof n === 'number' && n === 0) {
            videoAudioCheckedSrc = src;
            toast('这个视频没有可解码的音轨：片源本身无声，或音频编码（如 AC3 / DTS）不受浏览器支持 — 画面正常，声音出不来');
            if (src.indexOf('blob:') === 0) {
              status.textContent = '⚠ 这个本地视频没有可解码的音轨（无声片源，或音频编码 AC3 / DTS 等不受支持）。画面正常播放；想有声请转成 H.264 + AAC 的 MP4，或点「用系统播放器打开」（桌面版，装了 PotPlayer 就是它）。';
            }
          }
        } catch (e) {}
      }, 3000);
    }
    function markQueuePlaying(idx) {
      currentQueueIndex = idx;
      var items = grid.children;
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('playing', i === idx);
    }
    /* 放映单现在是真 MV：列表拉回来先逐个探播放地址，只留能播的，
       点一张直接播（地址是签名的、会过期，不跨会话存）。取不到就实话实说。
       点播时的取地址是兜底（比如缓存里没有的 MV）。 */
    var queueList = [];
    var mvUrlCache = {};
    function queueItemTitle(it) { return it.title || it.name || ''; }
    function playQueueItem(idx, tried) {
      if (idx < 0 || idx >= queueList.length) return;
      tried = tried || {};
      if (tried[idx]) return;
      tried[idx] = true;
      var item = queueList[idx];
      if (item.src) { loadRemote(item); markQueuePlaying(idx); return; }
      if (!item.id) { loadRemote(item); markQueuePlaying(idx); return; }
      status.textContent = '正在取 MV 播放地址…';
      fetch('/api/mv/url?id=' + encodeURIComponent(item.id) + '&provider=' + encodeURIComponent(item.provider || 'netease'))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.playable && d.url) {
            item.src = d.url;
            loadRemote(item);
            markQueuePlaying(idx);
          } else {
            advanceOnUnavailable(idx, tried);
          }
        })
        .catch(function () { toast('取 MV 播放地址失败：网络问题，换一张试试'); });
    }
    /* 有的 MV 要登录/会员才给地址：这张播不了就自动换下一张，别让用户卡在第一张。 */
    function advanceOnUnavailable(failedIdx, tried) {
      var next = -1, i;
      for (i = failedIdx + 1; i < queueList.length; i++) { if (!tried[i]) { next = i; break; } }
      if (next < 0) { for (i = 0; i < failedIdx; i++) { if (!tried[i]) { next = i; break; } } }
      if (next >= 0) {
        toast('《' + queueItemTitle(queueList[failedIdx]) + '》暂时播不了，自动换下一张');
        playQueueItem(next, tried);
      } else {
        toast('这一页的 MV 都暂时播不了，换个关键词搜搜');
      }
    }

    function loadRemote(mv) {
      if (localVideoURL) { URL.revokeObjectURL(localVideoURL); localVideoURL = null; }
      currentLocalFile = null; currentLocalFilePath = '';
      $('cinOpenExtBtn').classList.add('cin-hidden');
      resetVideoPro();
      video.muted = false;
      video.volume = cinemaVolume;
      ensureVideoAudioPath();
      applyCinemaOutputDevice();
      var u = proxiedVideoUrl(mv.src);
      video.src = u;
      try { ambientVideo.src = u; } catch (e) {}
      $('cinTitle').textContent = '正在放映 · ' + mv.title + ' — ' + mv.artist;
      $('cinMetaFmt').textContent = extOf(mv.src);
      $('cinMetaSrc').textContent = mv.srcLabel || mv.plat;
      $('cinMetaRes').textContent = '读取中…';
      status.textContent = '';
      video.play().then(function () { toast('正在原画播放：' + mv.title); checkVideoAudio(); startDiagTimer(); })
        .catch(function () { toast('点 ▶ 播放按钮开始播放'); });
      pauseHostAudio();
    }

    function loadLocalFile(f) {
      if (!f) return;
      var ext = (f.name.split('.').pop() || '').toUpperCase();
      if (localVideoURL) URL.revokeObjectURL(localVideoURL);
      localVideoURL = URL.createObjectURL(f);
      currentLocalFile = f;
      currentLocalFilePath = (IS_DESKTOP && DW && DW.filePath) ? DW.filePath(f) : '';
      $('cinOpenExtBtn').classList.toggle('cin-hidden', !(IS_DESKTOP && currentLocalFilePath));
      resetVideoPro();
      video.muted = false;
      video.volume = cinemaVolume;
      ensureVideoAudioPath();
      applyCinemaOutputDevice();
      video.src = localVideoURL;
      try { ambientVideo.src = localVideoURL; } catch (e) {}
      markQueuePlaying(-1);
      $('cinTitle').textContent = '正在放映 · ' + f.name + ' — 本地视频';
      $('cinMetaFmt').textContent = ext;
      $('cinMetaSrc').textContent = '本地文件';
      $('cinMetaRes').textContent = '读取中…';
      status.textContent = '已导入：' + f.name + ' · ' + ext + ' · ' + fileSizeMB(f) + ' · 正在读取原始分辨率…（文件只在本机浏览器里播放，不上传）';
      video.play().then(function () { toast('本地视频原画播放中：' + f.name); checkVideoAudio(); startDiagTimer(); })
        .catch(function () { toast('点 ▶ 播放本地视频'); });
      pauseHostAudio();
    }

    /* ---------- 音乐 MV 列表 ---------- */
    var grid = $('cinMvGrid');
    var mvLoaded = false;
    function normMv(m) {
      var provider = m.provider || 'netease';
      var plat = provider === 'ytmusic' ? 'YouTube Music' : '网易云音乐';
      return { id: m.id, title: m.name || m.title || '', artist: m.artist || '', provider: provider, plat: plat, srcLabel: plat + ' MV', cover: m.cover || '', src: null };
    }
    function renderQueue() {
      grid.innerHTML = '';
      queueList.forEach(function (mv, idx) {
        var b = el('button', 'cin-item');
        if (mv.cover) {
          b.innerHTML = '<img src="' + esc(mv.cover) + '" alt="" loading="lazy" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block">' +
            '<div class="mi"><b>' + (idx + 1) + '. ' + esc(mv.title) + '</b><span>' + esc(mv.artist) + ' · ' + esc(mv.plat) + '</span></div>';
        } else {
          b.innerHTML = '<video muted preload="metadata" src="' + esc(mv.src) + '#t=1"></video>' +
            '<div class="mi"><b>' + (idx + 1) + '. ' + esc(mv.title) + '</b><span>' + esc(mv.artist) + ' · ' + esc(mv.plat) + '</span></div>';
        }
        b.onclick = function () { playQueueItem(idx); };
        grid.appendChild(b);
      });
      markQueuePlaying(currentQueueIndex);
    }
    function useDemoFallback(note) {
      queueList = DEMO_MVS.slice();
      queueList.forEach(function (it) { it.srcLabel = '演示 MV · ' + it.plat; });
      renderQueue();
      var n = $('cinMvNote');
      if (n) n.textContent = note || 'MV 服务暂时连不上，先看演示片段';
    }
    function loadMvList(kind, kw) {
      var url = kind === 'search'
        ? '/api/mv/search?keywords=' + encodeURIComponent(kw || '') + '&limit=12'
        : '/api/mv/first?limit=12';
      var n = $('cinMvNote');
      if (n) n.textContent = kind === 'search' ? '正在搜 MV…' : '正在拉最新 MV…';
      return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
        var list = (d && d.mvs) || [];
        if (!list.length) {
          if (kind === 'search') { if (n) n.textContent = '没搜到这个 MV，换个歌名或歌手试试'; return false; }
          useDemoFallback('最新 MV 拉不到，先看演示片段');
          return false;
        }
        if (n) n.textContent = '正在确认哪些 MV 能播…';
        return probeMvUrls(list.map(normMv)).then(function (playable) {
          if (!playable.length) {
            if (kind === 'search') { if (n) n.textContent = '搜到的 MV 都播不了 — 网易云的可能要登录，或换个关键词'; return false; }
            useDemoFallback('最新 MV 都要登录才能播，先看演示片段 — 登录网易云后更多 MV 能播');
            return false;
          }
          queueList = playable;
          currentQueueIndex = -1;
          renderQueue();
          if (n) n.textContent = kind === 'search' ? ('搜到 ' + playable.length + ' 个能播的 MV') : '最新 MV（能播的）';
          return true;
        });
      }).catch(function () {
        if (kind === 'search') { if (n) n.textContent = '搜 MV 失败：网络连不上，换个词再试'; return false; }
        useDemoFallback('最新 MV 拉不到，先看演示片段');
        return false;
      });
    }
    /* 逐个探地址：没登录时最新 MV 常常全是要会员的，探完只留能播的，
       用户点哪张都不会撞上“播不了”。 */
    function probeMvUrls(items) {
      var jobs = items.map(function (m) {
        var cacheKey = (m.provider || 'netease') + ':' + m.id;
        if (mvUrlCache[cacheKey]) { m.src = mvUrlCache[cacheKey]; return Promise.resolve(m); }
        return fetch('/api/mv/url?id=' + encodeURIComponent(m.id) + '&provider=' + encodeURIComponent(m.provider || 'netease'))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.playable && d.url) { mvUrlCache[cacheKey] = d.url; m.src = d.url; }
            return m;
          }).catch(function () { return m; });
      });
      return Promise.all(jobs).then(function (done) {
        return done.filter(function (m) { return !!m.src; });
      });
    }
    function ensureMvListLoaded() {
      if (mvLoaded) return;
      mvLoaded = true;
      loadMvList('first');
    }
    $('cinMvSearchBtn').onclick = function () {
      var kw = ($('cinMvSearchInput').value || '').trim();
      if (!kw) { toast('先在框里输歌名或歌手，再点搜 MV'); return; }
      loadMvList('search', kw);
    };
    $('cinMvSearchInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('cinMvSearchBtn').click();
    });

    /* ---------- 视频事件 ---------- */
    video.addEventListener('timeupdate', function () {
      if (video.duration) {
        $('cinMetaTime').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
        if (!seeking) $('cinSeek').value = Math.round(video.currentTime / video.duration * 1000);
      }
      if (abA !== null && abB !== null && !video.paused && video.currentTime >= abB) video.currentTime = abA;
      try {
        if (ambientVideo && !ambientVideo.classList.contains('cin-hidden') && !ambientVideo.paused && Math.abs(ambientVideo.currentTime - video.currentTime) > 0.6) ambientVideo.currentTime = video.currentTime;
      } catch (e) {}
    });
    video.addEventListener('play', function () {
      $('cinPlayBtn').textContent = '⏸ 暂停';
      pauseHostAudio();
      ensureVideoAudioPath();
      applyCinemaOutputDevice();
      startDiagTimer();
      try { if (!ambientVideo.classList.contains('cin-hidden')) { var ap = ambientVideo.play(); if (ap && ap.catch) ap.catch(function () {}); } } catch (e) {}
      if (video.currentSrc !== videoAudioCheckedSrc) checkVideoAudio();
    });
    video.addEventListener('pause', function () {
      $('cinPlayBtn').textContent = '▶ 播放';
      stopDiagTimer(); updateDiag();
      try { ambientVideo.pause(); } catch (e) {}
    });
    video.addEventListener('ended', function () {
      stopDiagTimer();
      if (currentQueueIndex >= 0 && currentQueueIndex < queueList.length - 1) {
        toast('下一张：' + queueItemTitle(queueList[currentQueueIndex + 1]));
        playQueueItem(currentQueueIndex + 1);
      } else if (currentQueueIndex >= 0) {
        toast('放映单播完了 — 再点一张，或搜个 MV');
      }
    });
    video.addEventListener('loadedmetadata', function () {
      if (video.videoWidth) $('cinMetaRes').textContent = video.videoWidth + ' × ' + video.videoHeight + ' · 原始';
      $('cinQualitySel').textContent = '原始 ' + video.videoWidth + '×' + video.videoHeight + '（源文件 · 不转码）';
      var sel = $('cinAudioTrackSel');
      sel.innerHTML = '';
      var tracks = video.audioTracks;
      if (tracks && tracks.length > 1) {
        for (var i = 0; i < tracks.length; i++) {
          var o = document.createElement('option');
          o.value = i;
          o.textContent = (tracks[i].label || ('音轨 ' + (i + 1))) + (tracks[i].language ? ' · ' + tracks[i].language : '');
          sel.appendChild(o);
        }
        for (var j = 0; j < tracks.length; j++) { if (tracks[j].enabled) sel.value = j; }
      } else { sel.innerHTML = '<option value="">单音轨</option>'; }
    });
    video.addEventListener('error', function () {
      if (video.currentSrc && video.currentSrc.indexOf('blob:') === 0) {
        status.textContent = '⚠ 浏览器无法解码这个本地文件的编码（容器或编码不受支持）。文件本身没问题 — 点「用系统播放器打开」（桌面版，装了 PotPlayer 就是它），或换 MP4(H.264) / WebM 文件。';
        toast('本地文件编码不受当前浏览器支持，见下方说明');
      }
    }, true);

    /* ---------- 放映控制台 ---------- */
    $('cinPlayBtn').onclick = function () { if (video.paused) video.play(); else video.pause(); };
    $('cinPrevBtn').onclick = function () {
      if (currentQueueIndex > 0) playQueueItem(currentQueueIndex - 1);
      else toast('已经是放映单第一张');
    };
    $('cinNextBtn').onclick = function () {
      if (currentQueueIndex >= 0 && currentQueueIndex < queueList.length - 1) playQueueItem(currentQueueIndex + 1);
      else if (currentQueueIndex < 0) playQueueItem(0);
      else toast('已经是放映单最后一张');
    };
    $('cinSeek').addEventListener('input', function () {
      seeking = true;
      if (video.duration) $('cinMetaTime').textContent = fmt(this.value / 1000 * video.duration) + ' / ' + fmt(video.duration);
    });
    $('cinSeek').addEventListener('change', function () {
      seeking = false;
      if (video.duration) video.currentTime = this.value / 1000 * video.duration;
    });
    $('cinVolSlider').addEventListener('input', function () {
      cinemaVolume = this.value / 100;
      video.volume = cinemaVolume;
      video.muted = false;
      if (videoGain) { try { videoGain.gain.value = cinemaVolume; } catch (e) {} }
      $('cinMuteBtn').textContent = cinemaVolume === 0 ? '🔇' : '🔊';
      updateDiag();
    });
    $('cinMuteBtn').onclick = function () {
      video.muted = !video.muted;
      this.textContent = video.muted ? '🔇' : '🔊';
      updateDiag();
    };
    $('cinSpeedSel').onchange = function () { video.playbackRate = parseFloat(this.value); toast('视频倍速 ' + this.value + '×'); };
    $('cinOrigBtn').onclick = function () {
      video.style.width = ''; video.style.maxHeight = '56vh';
      this.classList.add('on'); $('cinNativeBtn').classList.remove('on');
      toast('原始分辨率直通：自适应屏幕完整显示，不裁切、不转码');
    };
    $('cinNativeBtn').onclick = function () {
      video.style.width = 'auto'; video.style.maxHeight = 'none';
      video.style.maxWidth = '100%';
      this.classList.add('on'); $('cinOrigBtn').classList.remove('on');
      toast('1:1 原生尺寸：按源文件像素尺寸显示（超出屏幕时以屏幕为界）');
    };
    $('cinAmbientBtn').onclick = function () {
      var hidden = ambientVideo.classList.toggle('cin-hidden');
      this.classList.toggle('on', !hidden);
      if (!hidden && !video.paused) { try { var ap = ambientVideo.play(); if (ap && ap.catch) ap.catch(function () {}); } catch (e) {} }
      else { try { ambientVideo.pause(); } catch (e) {} }
      toast(hidden ? '氛围光已关' : '氛围光已开：画面颜色会漫到整个影厅');
    };
    $('cinFsBtn').onclick = function () {
      var target = video.closest('.cin-screenwrap') || video;
      if (target.requestFullscreen) target.requestFullscreen().catch(function () { toast('当前浏览器不允许全屏'); });
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else toast('当前浏览器不支持全屏');
    };
    $('cinPipBtn').onclick = function () {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function () { toast('当前浏览器不支持画中画，或视频还没开始播'); });
      else toast('当前浏览器不支持画中画');
    };
    $('cinToneBtn').onclick = function () {
      ensureVideoAudioPath();
      var ctx = videoCtx;
      var dest = videoGain || (ctx && ctx.destination);
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); dest = ctx.destination; } catch (e) {}
      }
      if (!ctx) { toast('播不了测试音：没有 AudioContext'); return; }
      try {
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
        var t = ctx.currentTime + 0.02;
        var osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        osc.connect(g); g.connect(dest);
        osc.start(t); osc.stop(t + 0.65);
        toast('测试音已播（880Hz，0.6 秒）— 听见了就是通路正常');
      } catch (e) { toast('测试音播失败：' + (e && e.message ? e.message : '')); }
    };
    $('cinResetOutBtn').onclick = function () {
      try { localStorage.removeItem('mineradio-audio-output-device-v1'); } catch (e) {}
      try { audioOutputDeviceId = ''; } catch (e) {}
      applyCinemaOutputDevice();
      updateDiag();
      toast('已恢复系统默认输出设备 — 再播一次视频试试');
    };
    $('cinProToggle').onclick = function () {
      var row = $('cinProRow');
      var hidden = row.classList.toggle('cin-hidden');
      this.textContent = hidden ? '🎛 放映控制 ▾' : '🎛 放映控制 ▴';
    };

    /* ---------- PotPlayer-style pro controls ---------- */
    function applyVideoFilter() {
      video.style.filter = 'brightness(' + ($('cinFltBright').value / 100) + ') contrast(' + ($('cinFltContrast').value / 100) + ') saturate(' + ($('cinFltSaturate').value / 100) + ')';
    }
    ['cinFltBright', 'cinFltContrast', 'cinFltSaturate'].forEach(function (id) { $(id).addEventListener('input', applyVideoFilter); });
    $('cinFltResetBtn').onclick = function () {
      video.style.filter = '';
      $('cinFltBright').value = 100; $('cinFltContrast').value = 100; $('cinFltSaturate').value = 100;
      toast('画面已还原');
    };
    $('cinPitchCheck').onchange = function () {
      video.preservesPitch = this.checked;
      try { video.mozPreservesPitch = this.checked; } catch (e) {}
      toast(this.checked ? '变速保音调：已开' : '变速保音调：已关（变速会变调）');
    };
    $('cinAbABtn').onclick = function () {
      abA = video.currentTime;
      $('cinAbState').textContent = 'A = ' + fmt(abA) + (abB !== null ? ' · B = ' + fmt(abB) : '');
      toast('A 点已设：' + fmt(abA));
    };
    $('cinAbBBtn').onclick = function () {
      if (abA === null) { toast('先设 A 点'); return; }
      if (video.currentTime <= abA) { toast('B 点要在 A 点之后'); return; }
      abB = video.currentTime;
      $('cinAbState').textContent = 'A = ' + fmt(abA) + ' · B = ' + fmt(abB) + ' · 循环中';
      toast('A-B 循环已开：' + fmt(abA) + ' — ' + fmt(abB));
    };
    $('cinAbClearBtn').onclick = function () { abA = null; abB = null; $('cinAbState').textContent = ''; toast('A-B 循环已取消'); };
    function frameStep(dir) {
      video.pause();
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + dir * (1 / currentFps)));
    }
    $('cinFrameBackBtn').onclick = function () { frameStep(-1); };
    $('cinFrameFwdBtn').onclick = function () { frameStep(1); };
    $('cinShotBtn').onclick = function () {
      if (!video.videoWidth) { toast('视频还没加载出画面，稍后再截'); return; }
      var c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      c.toBlob(function (b) {
        if (!b) { toast('截图失败'); return; }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'screenshot-' + Math.round(video.currentTime) + 's.png';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        toast('截图已保存');
      }, 'image/png');
    };
    function srtToVtt(t) {
      t = String(t || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      var blocks = t.split(/\n\s*\n/);
      var out = ['WEBVTT', ''];
      blocks.forEach(function (b) {
        var lines = b.split('\n').filter(function (x) { return x.trim() !== ''; });
        if (!lines.length) return;
        if (/^\d+$/.test(lines[0])) lines.shift();
        if (lines.length < 2) return;
        lines[0] = lines[0].replace(/,/g, '.');
        out.push(lines.join('\n')); out.push('');
      });
      return out.join('\n');
    }
    function assToVtt(t) {
      var out = ['WEBVTT', ''];
      String(t || '').split(/\n/).forEach(function (line) {
        if (line.indexOf('Dialogue:') !== 0) return;
        var parts = line.slice(9).split(',');
        if (parts.length < 10) return;
        var start = parts[1].trim(), end = parts[2].trim();
        var text = parts.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim();
        if (!text) return;
        function norm(s) {
          var m = s.match(/^(\d+):(\d\d):(\d\d)\.(\d\d)$/);
          if (!m) return s;
          return ('0' + m[1]).slice(-2) + ':' + m[2] + ':' + m[3] + '.' + m[4] + '0';
        }
        out.push(norm(start) + ' --> ' + norm(end)); out.push(text); out.push('');
      });
      return out.join('\n');
    }
    $('cinSubBtn').onclick = function () { $('cinSubFile').click(); };
    $('cinSubFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      var ext = (f.name.split('.').pop() || '').toLowerCase();
      var reader = new FileReader();
      reader.onload = function () {
        var vtt = ext === 'vtt' ? String(reader.result || '') : (ext === 'ass' || ext === 'ssa' ? assToVtt(reader.result) : srtToVtt(reader.result));
        if (subTrackEl) { try { subTrackEl.remove(); } catch (e) {} }
        var blob = new Blob([vtt], { type: 'text/vtt' });
        subTrackEl = document.createElement('track');
        subTrackEl.kind = 'subtitles'; subTrackEl.label = '外挂字幕'; subTrackEl.srclang = 'zh';
        subTrackEl.src = URL.createObjectURL(blob);
        subTrackEl.default = true;
        video.appendChild(subTrackEl);
        try { video.textTracks[0].mode = 'showing'; } catch (e) {}
        $('cinSubState').textContent = f.name + ((ext === 'ass' || ext === 'ssa') ? '（ASS 样式不还原，只显示对白）' : '');
        toast('字幕已加载：' + f.name);
      };
      reader.readAsText(f);
    });
    $('cinAudioTrackSel').onchange = function () {
      var tracks = video.audioTracks;
      if (!tracks) return;
      for (var i = 0; i < tracks.length; i++) tracks[i].enabled = (i === parseInt(this.value, 10));
      toast('已切换音轨');
    };
    $('cinMediaInfoBtn').onclick = function () {
      var p = $('cinMediaInfoPanel');
      if (!p.classList.contains('cin-hidden')) { p.classList.add('cin-hidden'); return; }
      var lines = [];
      lines.push('来源：' + ($('cinMetaSrc').textContent || '—'));
      lines.push('格式：' + ($('cinMetaFmt').textContent || '—') + '　分辨率：' + (video.videoWidth ? video.videoWidth + ' × ' + video.videoHeight : '—') + '　时长：' + (video.duration ? fmt(video.duration) : '—'));
      if (currentLocalFile) lines.push('文件：' + currentLocalFile.name + '　' + fileSizeMB(currentLocalFile));
      try {
        lines.push('已解码视频：' + (video.webkitVideoDecodedByteCount || 0) + ' 字节　已解码音频：' + (video.webkitAudioDecodedByteCount || 0) + ' 字节（音频为 0 = 无声片源或 AC3/DTS 等编码不受支持）');
      } catch (e) {}
      p.textContent = lines.join('\n');
      p.classList.remove('cin-hidden');
      if (IS_DESKTOP && currentLocalFilePath && DW && DW.mediaInfo) {
        DW.mediaInfo(currentLocalFilePath).then(function (r) {
          if (!r || !r.ok) { p.textContent += '\n详细编码：' + ((r && r.reason === 'no_ffprobe') ? '本机未装 ffprobe，装一个就能显示完整编码信息' : '读取失败'); return; }
          p.textContent += '\n容器：' + (r.format || '—') + '　总码率：' + (r.bitrate ? (r.bitrate / 1000).toFixed(0) + ' kbps' : '—');
          (r.streams || []).forEach(function (s) {
            if (s.type === 'video') {
              p.textContent += '\n视频：' + (s.codec || '—') + ' ' + (s.width || '') + '×' + (s.height || '') + '　帧率：' + (s.fps || '—');
              var fr = (s.fps || '').split('/');
              if (fr.length === 2 && +fr[1]) currentFps = Math.round(+fr[0] / +fr[1]) || 30;
            }
            if (s.type === 'audio') p.textContent += '\n音频：' + (s.codec || '—') + (s.channels ? ' · ' + s.channels + ' 声道' : '') + (s.language ? ' · ' + s.language : '');
            if (s.type === 'subtitle') p.textContent += '\n内挂字幕：' + (s.codec || '—') + (s.language ? ' · ' + s.language : '');
          });
        }).catch(function () {});
      }
    };
    $('cinOpenExtBtn').onclick = function () {
      if (!currentLocalFilePath) { toast('没有本地文件路径'); return; }
      DW.openFilePlayer(currentLocalFilePath).then(function (r) {
        if (r && r.ok) toast('已用系统默认播放器打开（装了 PotPlayer 就是它）');
        else toast('打不开：' + ((r && r.reason) || '未知原因'));
      }).catch(function () { toast('打不开系统播放器'); });
    };

    /* ---------- URL + local import ---------- */
    $('cinUrlBtn').onclick = function () {
      var u = ($('cinUrlInput').value || '').trim();
      if (!u) { toast('先粘贴一个视频直链'); return; }
      loadRemote({ title: u.split('/').pop() || u, artist: '链接', plat: '直链', src: u });
      markQueuePlaying(-1);
    };
    $('cinPickBtn').onclick = function () { $('cinLocalFile').click(); };
    $('cinLocalFile').addEventListener('change', function () { loadLocalFile(this.files[0]); this.value = ''; });
    var dz = $('cinDropZone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadLocalFile(f);
    });

    /* ---------- open / close ---------- */
    openBtn.onclick = function () { overlay.classList.remove('cin-hidden'); ensureMvListLoaded(); updateDiag(); };
    $('cinClose').onclick = function () {
      overlay.classList.add('cin-hidden');
      stopDiagTimer();
      try { video.pause(); } catch (e) {}
    };
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { overlay.classList.add('cin-hidden'); stopDiagTimer(); try { video.pause(); } catch (e2) {} }
    });

    window.__cinema = {
      open: function () { overlay.classList.remove('cin-hidden'); ensureMvListLoaded(); updateDiag(); },
      close: function () { overlay.classList.add('cin-hidden'); stopDiagTimer(); try { video.pause(); } catch (e) {} },
      playUrl: function (u) { overlay.classList.remove('cin-hidden'); loadRemote({ title: u, artist: '链接', plat: '直链', src: u }); markQueuePlaying(-1); },
      playLocal: loadLocalFile,
      playQueue: playQueueItem,
      searchMv: function (kw) { overlay.classList.remove('cin-hidden'); ensureMvListLoaded(); return loadMvList('search', kw); },
    };
  }
})();
