/**
 * LIZI · PWA / iOS 适配层
 * ------------------------------------------------------------------
 * 三件事：
 *  1) 注册 Service Worker（让站点可安装、断网时有壳）
 *  2) Media Session：把歌名/歌手/封面/进度交给系统，锁屏与控制中心才有信息和控制键
 *     —— 这是 iOS 上"网页也能像 App 一样控歌"的关键，项目以前完全没有
 *  3) iOS 现实适配：
 *     · 主通道是 HTMLMediaElement（new Audio()），锁屏/切后台能继续播；
 *       纯 WebAudio 那条路在后台会被系统挂起，所以这里不碰它
 *     · 回到前台时若"逻辑上在播、元素却停了"（iOS 偶发），自动续一次
 *     · 仅在 Safari 且未安装时，给一条可关闭的"添加到主屏幕"提示
 *
 * 全部逻辑独立成文件，不改播放器引擎；Player 不存在时静默退出。
 */
(() => {
  'use strict';

  /* ---------- 1. Service Worker ---------- */
  if ('serviceWorker' in navigator &&
      (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* 注册失败不影响播放 */ });
    });
  }

  /* ---------- 2. Media Session（锁屏 / 控制中心 / 耳机键） ---------- */
  const ms = navigator.mediaSession;
  const P = window.Player;
  if (!ms || !P || typeof P.on !== 'function') return;

  const coverUrl = (track, size) => {
    const raw = track && (track.cover || track.pic || track.albumPic);
    if (!raw) return null;
    try {
      if (window.API && typeof window.API.img === 'function') return window.API.img(raw, size);
    } catch { /* 落到原始地址 */ }
    return raw;
  };

  const artistText = (track) => {
    const a = track && (track.artists || track.artist);
    if (!a) return '';
    if (typeof a === 'string') return a;
    if (Array.isArray(a)) return a.map((x) => (typeof x === 'string' ? x : (x && x.name) || '')).filter(Boolean).join(' / ');
    return String(a);
  };

  /* 原生壳桥接：装在 iOS 原生壳里时，把曲目信息推给原生 NowPlaying，
     锁屏封面/标题比纯 Media Session 更稳（各 iOS 版本表现一致）。网页里无此对象，自动跳过。 */
  let lastTrack = null;
  function pushNative(extra) {
    const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.lizi;
    if (!h || typeof h.postMessage !== 'function') return;
    const el = P.audio;
    const t = lastTrack || {};
    try {
      h.postMessage(Object.assign({
        title: t.name || t.title || '',
        artist: artistText(t),
        album: (t.album && (t.album.name || t.album)) || '',
        artwork: coverUrl(t, 512) || '',
        duration: el && isFinite(el.duration) ? el.duration : 0,
        position: el ? el.currentTime : 0,
        playing: !!(P.state && P.state.playing),
      }, extra || {}));
    } catch { /* 桥接失败不影响播放 */ }
  }

  function setMetadata(track) {
    if (!track || typeof window.MediaMetadata !== 'function') return;
    const art = [];
    [96, 192, 256, 384, 512].forEach((s) => {
      const u = coverUrl(track, s);
      if (u) art.push({ src: u, sizes: s + 'x' + s, type: 'image/jpeg' });
    });
    try {
      ms.metadata = new window.MediaMetadata({
        title: track.name || track.title || '未知曲目',
        artist: artistText(track),
        album: (track.album && (track.album.name || track.album)) || '',
        artwork: art,
      });
    } catch { /* 元数据失败不影响播放 */ }
  }

  function setPosition() {
    const el = P.audio;
    if (!el || !isFinite(el.duration) || el.duration <= 0) return;
    try {
      ms.setPositionState({
        duration: el.duration,
        playbackRate: el.playbackRate || 1,
        position: Math.min(el.currentTime, el.duration),
      });
    } catch { /* 某些 iOS 版本不支持，忽略 */ }
  }

  P.on('trackchange', ({ track }) => { lastTrack = track; setMetadata(track); setPosition(); pushNative(); });
  P.on('playstate', (playing) => {
    try { ms.playbackState = playing ? 'playing' : 'paused'; } catch { /* ignore */ }
    setPosition();
    pushNative({ playing: !!playing });
  });

  let lastPos = 0;
  P.on('time', ({ cur }) => {
    // 每秒最多上报一次，别把桥接打满
    if (Math.abs(cur - lastPos) >= 1) { lastPos = cur; setPosition(); pushNative(); }
  });

  const act = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* 该平台不支持这个动作 */ } };
  act('play', () => { if (P.audio && P.audio.paused) P.toggle(); });
  act('pause', () => { if (P.audio && !P.audio.paused) P.toggle(); });
  act('previoustrack', () => { try { P.prev(); } catch { /* ignore */ } });
  act('nexttrack', () => { try { P.next(); } catch { /* ignore */ } });
  act('seekto', (d) => {
    if (!P.audio || !d || typeof d.seekTime !== 'number') return;
    try { P.audio.currentTime = Math.max(0, d.seekTime); setPosition(); } catch { /* ignore */ }
  });
  act('seekbackward', (d) => {
    if (!P.audio) return;
    const step = (d && d.seekOffset) || 10;
    try { P.audio.currentTime = Math.max(0, P.audio.currentTime - step); setPosition(); } catch { /* ignore */ }
  });
  act('seekforward', (d) => {
    if (!P.audio) return;
    const step = (d && d.seekOffset) || 10;
    try { P.audio.currentTime = Math.min(P.audio.duration || 1e9, P.audio.currentTime + step); setPosition(); } catch { /* ignore */ }
  });

  /* ---------- 3. iOS 偶发"逻辑在播、元素停了"的自愈 ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const el = P.audio;
    if (!el || !el.src) return;
    const shouldPlay = P.state && P.state.playing;
    if (shouldPlay && el.paused) {
      // 只在"本该在播"时补一次，绝不覆盖用户主动暂停
      el.play().catch(() => { /* 需要手势时不强求 */ });
    }
    setPosition();
  });

  /* ---------- 4. iOS 引导：Safari 优先 ----------
     结论来自实测与公开缺陷记录：standalone（添加到主屏幕）模式切后台音频会被掐断
     （WebKit bug 198277，iOS 26 另有 PWA 音频失效报告）；留在 Safari 标签页里，
     用 <audio> 播放锁屏/切 App 都能继续。所以这里不再劝人装到主屏幕。 */
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|MicroMessenger/.test(ua);
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  function banner(html, withOpenBtn) {
    const tip = document.createElement('div');
    tip.setAttribute('role', 'status');
    tip.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));' +
      'z-index:99999;padding:12px 14px;border-radius:14px;font-size:13px;line-height:1.6;' +
      'background:rgba(12,14,20,.92);color:#eaf2ff;border:1px solid rgba(255,255,255,.14);' +
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 12px 32px rgba(0,0,0,.45)';
    tip.innerHTML = html +
      '<button type="button" data-x style="position:absolute;top:6px;right:8px;background:none;border:0;color:#9fb4d0;font-size:18px;line-height:1;padding:4px" aria-label="关闭">×</button>';
    if (withOpenBtn) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '用 Safari 打开';
      b.style.cssText = 'margin-top:8px;padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);' +
        'background:rgba(255,255,255,.1);color:#eaf2ff;font-size:12px';
      // standalone 里 target=_blank 会跳到 Safari，这是回到可靠后台播放的出口
      b.addEventListener('click', () => { window.open(location.href, '_blank'); });
      tip.appendChild(b);
    }
    tip.querySelector('[data-x]').addEventListener('click', () => {
      try { localStorage.setItem('lizi_ios_tip_dismissed', '1'); } catch (e) {}
      tip.remove();
    });
    document.body.appendChild(tip);
    setTimeout(() => { if (tip.parentNode) tip.remove(); }, 18000);
  }

  let dismissed = false;
  try { dismissed = localStorage.getItem('lizi_ios_tip_dismissed') === '1'; } catch (e) {}

  if (isIOS && !dismissed) {
    if (standalone) {
      banner('当前是主屏幕安装版：<b>锁屏后音频可能被系统掐断</b>（iOS 已知限制）。<br>' +
             '<span style="opacity:.72">想稳定后台听歌，请改用 Safari 标签页播放。</span>', true);
    } else if (isSafari) {
      banner('锁屏 / 切到别的 App 都能继续播，控制键在锁屏和控制中心。<br>' +
             '<span style="opacity:.72">建议就留在 Safari 里听；添加到主屏幕的版本在部分 iOS 上后台会被掐断。</span>', false);
    }
  }
})();
