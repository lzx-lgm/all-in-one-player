/* Cinema — MV / 视频影院 (fork addition, v2.0.0).
   Mineradio 没有的一块：原格式 · 原分辨率 · 不转码。
   自包含模块：自己建 UI、自己接样式，不改 index.html 的布局。
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
      '.cin-btn{position:fixed;right:18px;bottom:18px;z-index:9990;padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(10,10,20,.85);color:#fff;font-size:14px;cursor:pointer;backdrop-filter:blur(8px)}',
      '.cin-btn:hover{background:linear-gradient(135deg,#7c3aed,#06b6d4)}',
      '.cin-overlay{position:fixed;inset:0;z-index:9991;background:rgba(0,0,0,.82);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}',
      '.cin-panel{width:min(1060px,96vw);background:#0d0d16;border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:16px;color:#eee;font-size:14px}',
      '.cin-panel h2{margin:0 0 4px;font-size:17px}',
      '.cin-panel .cin-sub{color:#9a9ab0;font-size:12.5px;margin-bottom:10px}',
      '.cin-close{float:right;background:none;border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:4px 10px;cursor:pointer}',
      '.cin-screen video{width:100%;max-height:58vh;background:#000;border-radius:10px;display:block}',
      '.cin-meta{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}',
      '.cin-chip{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;font-size:12.5px;color:#c9c9dd}',
      '.cin-chip b{color:#fff}',
      '.cin-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}',
      '.cin-tbtn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px}',
      '.cin-tbtn.on{background:#7c3aed;border-color:#22d3ee}',
      '.cin-pro{display:flex;gap:14px;flex-wrap:wrap;align-items:center;border-top:1px solid rgba(255,255,255,.12);padding-top:10px;margin-top:10px;font-size:13px}',
      '.cin-pro b{color:#fff}',
      '.cin-note{color:#9a9ab0;font-size:12px}',
      '.cin-info{margin-top:10px;padding:10px 12px;border:1px solid rgba(255,255,255,.16);border-radius:10px;font-size:12.5px;line-height:1.8;color:#b9b9cc;white-space:pre-wrap}',
      '.cin-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:10px}',
      '.cin-item{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;overflow:hidden;cursor:pointer;text-align:left;padding:0;color:#eee}',
      '.cin-item video{width:100%;height:96px;object-fit:cover;display:block;background:#000}',
      '.cin-item .mi{padding:8px}',
      '.cin-item .mi b{display:block;font-size:13px}',
      '.cin-item .mi span{font-size:12px;color:#9a9ab0}',
      '.cin-drop{margin-top:12px;border:1px dashed rgba(255,255,255,.3);border-radius:10px;padding:14px;text-align:center;color:#b9b9cc;font-size:13px}',
      '.cin-drop.drag{border-color:#7a7af0;background:rgba(90,90,214,.12)}',
      '.cin-urlrow{display:flex;gap:8px;margin-top:10px}',
      '.cin-urlrow input{flex:1;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#fff;padding:8px 10px;font-size:13px}',
      '.cin-hidden{display:none!important}',
    ].join('\n');
    document.head.appendChild(style);

    /* ---------- DOM ---------- */
    var openBtn = el('button', 'cin-btn', '🎬 影院');
    openBtn.title = 'MV / 视频影院：原格式 · 原分辨率 · 不转码';
    document.body.appendChild(openBtn);

    var overlay = el('div', 'cin-overlay cin-hidden');
    var panel = el('div', 'cin-panel');
    panel.innerHTML =
      '<button class="cin-close" id="cinClose">✕ 关闭</button>' +
      '<h2>MV / 视频影院</h2>' +
      '<div class="cin-sub">原格式 · 原分辨率 · 不转码 — 全能播放器独有。本地视频只在本机播放，不上传。</div>' +
      '<div class="cin-screen"><video id="cinVideo" controls playsinline preload="metadata"></video></div>' +
      '<div class="cin-meta">' +
      '<span class="cin-chip">原始分辨率 <b id="cinMetaRes">—</b></span>' +
      '<span class="cin-chip">原始格式 <b id="cinMetaFmt">—</b></span>' +
      '<span class="cin-chip">来源 <b id="cinMetaSrc">—</b></span>' +
      '<span class="cin-chip">处理 <b>不转码 · 不压缩 · 不裁切</b></span>' +
      '<span class="cin-chip">时间 <b id="cinMetaTime">—</b></span>' +
      '</div>' +
      '<div class="cin-bar">' +
      '<span id="cinTitle" style="flex:1;min-width:160px">还没选片 — 点下面的演示 MV，或拖入自己的视频</span>' +
      '<button class="cin-tbtn on" id="cinOrigBtn">原始分辨率直通</button>' +
      '<button class="cin-tbtn" id="cinNativeBtn">1:1 原生尺寸</button>' +
      '<button class="cin-tbtn" id="cinFsBtn">⛶ 全屏</button>' +
      '<button class="cin-tbtn" id="cinPipBtn">画中画</button>' +
      '<button class="cin-tbtn" id="cinPlayBtn">▶ 播放</button>' +
      '<select id="cinSpeedSel" class="cin-tbtn" title="视频倍速"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1.0× 倍速</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2.0×</option></select>' +
      '<span class="cin-tbtn" id="cinQualitySel" style="cursor:default">画质 · 原始（源文件）</span>' +
      '</div>' +
      '<div class="cin-pro">' +
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
      '<h3 style="margin:14px 0 0;font-size:14px">演示 MV</h3>' +
      '<div class="cin-grid" id="cinMvGrid"></div>';
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    var video = $('cinVideo');
    var status = $('cinLocalMeta');
    var currentLocalFile = null, currentLocalFilePath = '', localVideoURL = null;
    var abA = null, abB = null, subTrackEl = null, currentFps = 30;
    var videoAudioTimer = null, videoAudioCheckedSrc = '';

    function toast(msg) { status.textContent = msg; }
    function pauseHostAudio() {
      try {
        if (typeof audio !== 'undefined' && audio && !audio.paused) audio.pause();
      } catch (e) {}
    }
    /* 视频跟音乐走同一个输出设备：音乐经 setSinkId 选了输出口，视频默认只走系统默认口，
       两边设备不一致时就会出现“音乐有声、视频没声”。这里让视频每次加载/播放都跟随同一选择。 */
    function applyCinemaOutputDevice() {
      try {
        if (video && typeof video.setSinkId === 'function') {
          var id = (typeof audioOutputDeviceId !== 'undefined') ? (audioOutputDeviceId || '') : '';
          var p = video.setSinkId(id);
          if (p && p.catch) p.catch(function () {});
        }
      } catch (e) {}
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

    function loadRemote(mv) {
      if (localVideoURL) { URL.revokeObjectURL(localVideoURL); localVideoURL = null; }
      currentLocalFile = null; currentLocalFilePath = '';
      $('cinOpenExtBtn').classList.add('cin-hidden');
      resetVideoPro();
      video.muted = false;
      applyCinemaOutputDevice();
      video.src = proxiedVideoUrl(mv.src);
      $('cinTitle').textContent = mv.title + ' — ' + mv.artist;
      $('cinMetaFmt').textContent = extOf(mv.src);
      $('cinMetaSrc').textContent = '演示 MV · ' + mv.plat;
      $('cinMetaRes').textContent = '读取中…';
      status.textContent = '';
      video.play().then(function () { toast('正在原画播放：' + mv.title); checkVideoAudio(); })
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
      applyCinemaOutputDevice();
      video.src = localVideoURL;
      $('cinTitle').textContent = f.name + ' — 本地视频';
      $('cinMetaFmt').textContent = ext;
      $('cinMetaSrc').textContent = '本地文件';
      $('cinMetaRes').textContent = '读取中…';
      status.textContent = '已导入：' + f.name + ' · ' + ext + ' · ' + fileSizeMB(f) + ' · 正在读取原始分辨率…（文件只在本机浏览器里播放，不上传）';
      video.play().then(function () { toast('本地视频原画播放中：' + f.name); checkVideoAudio(); })
        .catch(function () { toast('点 ▶ 播放本地视频'); });
      pauseHostAudio();
    }

    /* ---------- demo MV grid ---------- */
    var grid = $('cinMvGrid');
    DEMO_MVS.forEach(function (mv) {
      var b = el('button', 'cin-item');
      b.innerHTML = '<video muted preload="metadata" src="' + esc(mv.src) + '#t=1"></video>' +
        '<div class="mi"><b>' + esc(mv.title) + '</b><span>' + esc(mv.artist) + ' · ' + esc(mv.plat) + '</span></div>';
      b.onclick = function () { loadRemote(mv); };
      grid.appendChild(b);
    });

    /* ---------- transport & display ---------- */
    video.addEventListener('timeupdate', function () {
      if (video.duration) $('cinMetaTime').textContent = fmt(video.currentTime) + ' / ' + fmt(video.duration);
      if (abA !== null && abB !== null && !video.paused && video.currentTime >= abB) video.currentTime = abA;
    });
    video.addEventListener('play', function () {
      $('cinPlayBtn').textContent = '⏸ 暂停';
      pauseHostAudio();
      applyCinemaOutputDevice();
      if (video.currentSrc !== videoAudioCheckedSrc) checkVideoAudio();
    });
    video.addEventListener('pause', function () { $('cinPlayBtn').textContent = '▶ 播放'; });
    video.addEventListener('loadedmetadata', function () {
      if (video.videoWidth) $('cinMetaRes').textContent = video.videoWidth + ' × ' + video.videoHeight + ' · 原始';
      $('cinQualitySel').textContent = '画质 · 原始 ' + video.videoWidth + '×' + video.videoHeight + '（源文件 · 不转码）';
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
    $('cinPlayBtn').onclick = function () { if (video.paused) video.play(); else video.pause(); };
    $('cinSpeedSel').onchange = function () { video.playbackRate = parseFloat(this.value); toast('视频倍速 ' + this.value + '×'); };
    $('cinOrigBtn').onclick = function () {
      video.style.width = ''; video.style.maxHeight = '58vh';
      this.classList.add('on'); $('cinNativeBtn').classList.remove('on');
      toast('原始分辨率直通：自适应屏幕完整显示，不裁切、不转码');
    };
    $('cinNativeBtn').onclick = function () {
      video.style.width = 'auto'; video.style.maxHeight = 'none';
      video.style.maxWidth = '100%';
      this.classList.add('on'); $('cinOrigBtn').classList.remove('on');
      toast('1:1 原生尺寸：按源文件像素尺寸显示（超出屏幕时以屏幕为界）');
    };
    $('cinFsBtn').onclick = function () {
      var target = video.closest('.cin-screen') || video;
      if (target.requestFullscreen) target.requestFullscreen().catch(function () { toast('当前浏览器不允许全屏'); });
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else toast('当前浏览器不支持全屏');
    };
    $('cinPipBtn').onclick = function () {
      if (document.pictureInPictureElement) document.exitPictureInPicture();
      else if (video.requestPictureInPicture) video.requestPictureInPicture().catch(function () { toast('当前浏览器不支持画中画，或视频还没开始播'); });
      else toast('当前浏览器不支持画中画');
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
    openBtn.onclick = function () { overlay.classList.remove('cin-hidden'); };
    $('cinClose').onclick = function () {
      overlay.classList.add('cin-hidden');
      try { video.pause(); } catch (e) {}
    };
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { overlay.classList.add('cin-hidden'); try { video.pause(); } catch (e2) {} }
    });

    window.__cinema = {
      open: function () { overlay.classList.remove('cin-hidden'); },
      close: function () { overlay.classList.add('cin-hidden'); try { video.pause(); } catch (e) {} },
      playUrl: function (u) { overlay.classList.remove('cin-hidden'); loadRemote({ title: u, artist: '链接', plat: '直链', src: u }); },
      playLocal: loadLocalFile,
    };
  }
})();
