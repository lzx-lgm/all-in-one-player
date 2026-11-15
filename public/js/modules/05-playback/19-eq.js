/* EQ 均衡器 (fork addition, v2.0.3)。
   音乐十段均衡：31 / 62 / 125 / 250 / 500 / 1k / 2k / 4k / 8k / 16k Hz，
   每段 -12 ~ +12 dB，8 套预设，开关 + 状态持久化。
   接法：音乐的 AudioContext 图谱里，source → EQ 滤波链 → analyser /
   beatAnalyser（频谱看到的就是你听到的），再经 gainNode 出去。
   不改 08-audio-graph-controls.js：initAudio 被包一层，建好图谱后立刻
   把 source 改接到 EQ 链上；任何一步出错都回落到直连（音乐不断）。
   只管音乐：影院视频走自己的 videoCtx，不经过这里。
   防御式加载：任何一步出错都不应拖垮整站启动。 */
(function () {
  'use strict';
  var BANDS = [
    { freq: 31, label: '31' }, { freq: 62, label: '62' }, { freq: 125, label: '125' },
    { freq: 250, label: '250' }, { freq: 500, label: '500' }, { freq: 1000, label: '1k' },
    { freq: 2000, label: '2k' }, { freq: 4000, label: '4k' }, { freq: 8000, label: '8k' },
    { freq: 16000, label: '16k' },
  ];
  var PRESETS = {
    flat: { name: '关闭', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    pop: { name: '流行', gains: [-1, 0, 1, 2, 3, 3, 1, 0, 2, 4] },
    rock: { name: '摇滚', gains: [4, 3, 2, 0, -1, -1, 0, 2, 4, 5] },
    jazz: { name: '爵士', gains: [3, 2, 1, 0, 0, 1, 2, 3, 4, 4] },
    classical: { name: '古典', gains: [4, 3, 2, 0, -1, -1, 0, 1, 3, 4] },
    vocal: { name: '人声', gains: [-2, -1, 0, 1, 3, 5, 4, 2, 0, -1] },
    bass: { name: '重低音', gains: [6, 5, 4, 2, 0, 0, -1, -1, -2, -2] },
    treble: { name: '明亮', gains: [-2, -2, -1, 0, 0, 1, 2, 3, 5, 6] },
  };
  var STORE_KEY = 'all-in-one-eq-v1';

  function initEq() {
    if (window.__eqLoaded) return;
    window.__eqLoaded = true;
    if (typeof document === 'undefined' || !document.body) return;

    var state = loadState(); // { enabled, preset, gains }
    var eqCtx = null, eqNodes = [], eqInput = null, eqOutput = null;

    function loadState() {
      var d = { enabled: true, preset: 'flat', gains: PRESETS.flat.gains.slice() };
      try {
        var raw = localStorage.getItem(STORE_KEY);
        if (!raw) return d;
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.gains) && s.gains.length === 10) d.gains = s.gains.map(function (g) { return Math.max(-12, Math.min(12, Number(g) || 0)); });
        if (s && typeof s.enabled === 'boolean') d.enabled = s.enabled;
        if (s && PRESETS[s.preset]) d.preset = s.preset;
      } catch (e) {}
      return d;
    }
    function saveState() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    }
    function el(tag, cls, html) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html != null) n.innerHTML = html;
      return n;
    }
    function $(id) { return document.getElementById(id); }

    /* ---------- graph wiring ---------- */
    function ensureEqNodes() {
      try {
        if (typeof audioCtx === 'undefined' || !audioCtx || audioCtx.state === 'closed') return false;
        if (eqCtx === audioCtx && eqNodes.length === 10) return true;
        eqCtx = audioCtx;
        eqNodes = BANDS.map(function (b) {
          var f = audioCtx.createBiquadFilter();
          f.type = 'peaking';
          f.frequency.value = b.freq;
          f.Q.value = 1.0;
          f.gain.value = 0;
          return f;
        });
        for (var i = 0; i < eqNodes.length - 1; i++) eqNodes[i].connect(eqNodes[i + 1]);
        eqInput = eqNodes[0];
        eqOutput = eqNodes[eqNodes.length - 1];
        applyGainsToNodes();
        return true;
      } catch (e) { return false; }
    }
    function applyGainsToNodes() {
      if (!eqNodes.length) return;
      for (var i = 0; i < eqNodes.length; i++) {
        try { eqNodes[i].gain.value = state.gains[i]; } catch (e) {}
      }
    }
    function useEqChain() {
      return !!state.enabled && state.preset !== 'flat' && ensureEqNodes();
    }
    /* 把 source 改接到 EQ 链上；出错一定回落直连，音乐不断。 */
    function applyEqRouting() {
      try {
        if (typeof source === 'undefined' || !source) return false;
        if (typeof analyser === 'undefined' || !analyser) return false;
        var useEq = useEqChain();
        try { eqOutput && eqOutput.disconnect(); } catch (e) {}
        source.disconnect();
        if (useEq) {
          source.connect(eqInput);
          eqOutput.connect(analyser);
          if (typeof beatAnalyser !== 'undefined' && beatAnalyser) eqOutput.connect(beatAnalyser);
        } else {
          source.connect(analyser);
          if (typeof beatAnalyser !== 'undefined' && beatAnalyser) source.connect(beatAnalyser);
        }
        return true;
      } catch (e) {
        try {
          source.disconnect();
          source.connect(analyser);
          if (typeof beatAnalyser !== 'undefined' && beatAnalyser) source.connect(beatAnalyser);
        } catch (e2) {}
        return false;
      }
    }
    /* 包一层 initAudio：图谱每次重建后都把 EQ 链接回去。 */
    if (typeof initAudio === 'function' && !window.__eqWrappedInitAudio) {
      window.__eqWrappedInitAudio = true;
      var origInitAudio = initAudio;
      initAudio = function () {
        var ok = origInitAudio();
        if (ok) { try { applyEqRouting(); } catch (e) {} }
        return ok;
      };
    }
    function setGains(gains, preset) {
      state.gains = gains.slice();
      if (preset) state.preset = preset;
      applyGainsToNodes();
      saveState();
      /* 预设在 flat 与非 flat 之间切换时，路由也要跟着切
         （直连 ↔ EQ 链），否则只改了没接上的滤波器增益。 */
      try { applyEqRouting(); } catch (e) {}
      refreshPanel();
    }
    function setEnabled(on) {
      state.enabled = !!on;
      saveState();
      try { applyEqRouting(); } catch (e) {}
      refreshPanel();
    }

    /* ---------- styles ---------- */
    var style = el('style');
    style.textContent = [
      '.eq-btn{position:fixed;left:18px;bottom:18px;z-index:9990;padding:11px 18px;border-radius:999px;border:1px solid rgba(167,139,250,.55);background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 24px rgba(124,58,237,.45)}',
      '.eq-btn:hover{filter:brightness(1.12)}',
      '.eq-panel{position:fixed;left:18px;bottom:74px;z-index:9991;width:472px;max-width:94vw;background:linear-gradient(180deg,#14101f,#0b0b14);border:1px solid rgba(167,139,250,.4);border-radius:16px;padding:14px 16px;color:#eee;font-size:13px;box-shadow:0 24px 80px rgba(0,0,0,.6)}',
      '.eq-panel h3{margin:0 0 2px;font-size:15px}',
      '.eq-panel .eq-sub{color:#9a9ab0;font-size:12px;margin-bottom:10px}',
      '.eq-close{float:right;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.3);color:#fff;border-radius:8px;padding:3px 9px;cursor:pointer}',
      '.eq-bands{display:flex;justify-content:space-between;gap:2px;margin:6px 0 4px}',
      '.eq-band{display:flex;flex-direction:column;align-items:center;gap:2px;width:44px}',
      '.eq-band .eq-db{font-size:11px;color:#22d3ee;min-height:14px;font-variant-numeric:tabular-nums}',
      '.eq-slot{width:28px;height:128px;display:flex;align-items:center;justify-content:center}',
      '.eq-slot input[type=range]{width:128px;margin:0;transform:rotate(-90deg);appearance:none;-webkit-appearance:none;height:8px;border-radius:4px;background:linear-gradient(90deg,#7c3aed,#06b6d4);outline:none;cursor:pointer}',
      '.eq-slot input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2px solid #7c3aed;box-shadow:0 0 8px rgba(124,58,237,.8)}',
      '.eq-slot input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #7c3aed}',
      '.eq-band .eq-freq{font-size:11px;color:#c9c9dd}',
      '.eq-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}',
      '.eq-pbtn{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12.5px}',
      '.eq-pbtn.on{background:#7c3aed;border-color:#22d3ee}',
      '.eq-foot{display:flex;gap:8px;align-items:center;margin-top:10px;font-size:12px;color:#9a9ab0}',
      '.eq-switch{margin-left:auto;display:flex;align-items:center;gap:6px;color:#eee;font-size:13px}',
      '.eq-hidden{display:none!important}',
    ].join('\n');
    document.head.appendChild(style);

    /* ---------- DOM ---------- */
    var openBtn = el('button', 'eq-btn', '🎚 EQ 均衡器');
    openBtn.title = '十段均衡器：调音乐的音色，换个预设听听';
    document.body.appendChild(openBtn);

    var panel = el('div', 'eq-panel eq-hidden');
    var bandsHtml = BANDS.map(function (b, i) {
      return '<div class="eq-band"><span class="eq-db" id="eqDb' + i + '">0</span>' +
        '<div class="eq-slot"><input type="range" id="eqSlider' + i + '" min="-12" max="12" step="1" value="0" title="' + b.freq + ' Hz"></div>' +
        '<span class="eq-freq">' + b.label + ' Hz</span></div>';
    }).join('');
    var presetsHtml = Object.keys(PRESETS).map(function (k) {
      return '<button class="eq-pbtn" data-eq-preset="' + k + '">' + PRESETS[k].name + '</button>';
    }).join('');
    panel.innerHTML =
      '<button class="eq-close" id="eqClose">✕</button>' +
      '<h3>🎚 EQ 均衡器</h3>' +
      '<div class="eq-sub">只调音乐（影院视频走自己的声音专线，不经过这里）。上下拖动改音色，换预设一键切换。</div>' +
      '<div class="eq-bands">' + bandsHtml + '</div>' +
      '<div class="eq-presets">' + presetsHtml + '</div>' +
      '<div class="eq-foot"><button class="eq-pbtn" id="eqResetBtn">还原</button><span id="eqStateText"></span>' +
      '<label class="eq-switch"><input type="checkbox" id="eqEnableCheck" checked> 均衡器开关</label></div>';
    document.body.appendChild(panel);

    function refreshPanel() {
      for (var i = 0; i < 10; i++) {
        var s = $('eqSlider' + i), d = $('eqDb' + i);
        if (s) s.value = state.gains[i];
        if (d) d.textContent = (state.gains[i] > 0 ? '+' : '') + state.gains[i];
      }
      var btns = panel.querySelectorAll('[data-eq-preset]');
      for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('on', btns[j].getAttribute('data-eq-preset') === state.preset);
      var chk = $('eqEnableCheck');
      if (chk) chk.checked = !!state.enabled;
      var st = $('eqStateText');
      if (st) st.textContent = !state.enabled ? '均衡器已关（直通）' : ('当前：' + PRESETS[state.preset].name + (state.preset === 'flat' ? '（直通）' : ''));
    }
    for (var i = 0; i < 10; i++) {
      (function (idx) {
        $('eqSlider' + idx).addEventListener('input', function () {
          var g = state.gains.slice();
          g[idx] = parseInt(this.value, 10);
          state.gains = g;
          state.preset = 'flat';
          var isFlat = g.every(function (v) { return v === 0; });
          if (!isFlat) state.preset = 'custom';
          if (isFlat) state.preset = 'flat';
          applyGainsToNodes();
          saveState();
          try { applyEqRouting(); } catch (e) {}
          refreshPanel();
        });
      })(i);
    }
    var presetBtns = panel.querySelectorAll('[data-eq-preset]');
    for (var p = 0; p < presetBtns.length; p++) {
      presetBtns[p].addEventListener('click', function () {
        var key = this.getAttribute('data-eq-preset');
        if (!PRESETS[key]) return;
        if (!state.enabled) state.enabled = true;
        setGains(PRESETS[key].gains, key);
      });
    }
    $('eqResetBtn').onclick = function () { setGains(PRESETS.flat.gains, 'flat'); };
    $('eqEnableCheck').addEventListener('change', function () { setEnabled(this.checked); });
    openBtn.onclick = function () { panel.classList.toggle('eq-hidden'); refreshPanel(); };
    $('eqClose').onclick = function () { panel.classList.add('eq-hidden'); };

    /* 自定义预设不进 PRESETS 表，refreshPanel 里按名字显示即可。 */
    PRESETS.custom = { name: '自定义', gains: state.gains.slice() };
    refreshPanel();

    window.__eq = {
      setPreset: function (key) { if (PRESETS[key]) { if (!state.enabled) state.enabled = true; setGains(PRESETS[key].gains, key); } },
      setEnabled: setEnabled,
      getState: function () { return { enabled: state.enabled, preset: state.preset, gains: state.gains.slice() }; },
      applyRouting: applyEqRouting,
      bands: BANDS.map(function (b) { return b.freq; }),
    };
  }

  /* 启动点放最后：BANDS / PRESETS / STORE_KEY 的赋值必须先完成，
     否则 initEq 里的 loadState 读不到 PRESETS（var 提升陷阱）。 */
  try { initEq(); } catch (e) { /* eq is optional; never break boot */ }
})();
