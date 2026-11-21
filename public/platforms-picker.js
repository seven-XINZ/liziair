/* 平台管理选择器
   背景：设置页「平台管理」原来依赖 intro.js 里的开场多选，但 intro.js 已缺失，
   这一行变成死按钮（点了没反应）。这里补一个独立、无依赖的选择弹窗：
   - 读写 localStorage['lizi.platforms.v1']（与 app.js 的 PLATS_KEY 一致）
   - 保存后派发 lizi:platforms，让大厅「我的」与顶部平台条就地重画
   只影响展示，不碰登录 / 播放 / 音频。 */
(() => {
  'use strict';

  const KEY = 'lizi.platforms.v1';
  const PLATS = [
    { id: 'netease', name: '网易云音乐', logo: 'assets/platforms/netease.svg', bg: '#EA3E3C' },
    { id: 'qq', name: 'QQ 音乐', logo: 'assets/platforms/qq.svg', bg: '#F8C913' },
    { id: 'kugou', name: '酷狗音乐', logo: 'assets/platforms/kugou-mark.svg', bg: '#3D8BFA' },
    { id: 'qishui', name: '汽水音乐', logo: 'assets/platforms/qishui.svg', bg: '#111111' },
    { id: 'bodian', name: '波点音乐', logo: 'assets/platforms/bodian.svg', bg: '#04E3B4' },
  ];
  const ALL = PLATS.map((p) => p.id);

  function readSel() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return ALL.slice();
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return ALL.slice();
      const ids = [...new Set(arr)].filter((id) => PLATS.some((p) => p.id === id));
      return ids.length ? ids : ALL.slice();
    } catch { return ALL.slice(); }
  }

  function paintLabel(ids) {
    const el = document.getElementById('set-platforms');
    if (!el) return;
    el.textContent = ids.length === ALL.length ? `全部 ${ALL.length} 个` : `已选 ${ids.length} 个`;
  }

  function save(ids) {
    try {
      if (ids.length === ALL.length) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify(ids));
    } catch { /* 隐私模式写不进去：本次会话内仍然生效 */ }
    paintLabel(ids);
    try {
      window.dispatchEvent(new CustomEvent('lizi:platforms', { detail: { flat: false } }));
    } catch { /* 老浏览器 */ }
  }

  let overlay = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  function open() {
    if (overlay) return;
    const cur = new Set(readSel());

    overlay = document.createElement('div');
    overlay.id = 'plat-picker';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '平台管理');
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:220',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px', 'background:rgba(8,10,16,.52)',
      'backdrop-filter:blur(14px) saturate(1.1)',
      '-webkit-backdrop-filter:blur(14px) saturate(1.1)',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
      'width:min(560px,100%)', 'max-height:min(80vh,640px)', 'overflow:auto',
      'border-radius:22px', 'padding:22px 22px 18px',
      'background:rgba(22,24,32,.92)', 'color:#f2f4f8',
      'box-shadow:0 24px 70px rgba(0,0,0,.5)',
      'border:1px solid rgba(255,255,255,.1)',
      'font-family:inherit',
    ].join(';');

    const head = document.createElement('h2');
    head.textContent = '平台管理';
    head.style.cssText = 'margin:0 0 4px;font-size:19px;font-weight:650;letter-spacing:.02em';

    const sub = document.createElement('p');
    sub.textContent = '选择要在大厅「我的」和顶部平台条里显示的平台，不影响登录、搜索与播放。';
    sub.style.cssText = 'margin:0 0 16px;font-size:13px;line-height:1.6;color:rgba(242,244,248,.62)';

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px';

    const cells = new Map();
    PLATS.forEach((p) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.dataset.id = p.id;
      cell.setAttribute('aria-pressed', 'false');
      cell.style.cssText = [
        'position:relative', 'display:flex', 'flex-direction:column',
        'align-items:center', 'gap:8px', 'padding:12px 8px 10px',
        'border-radius:14px', 'cursor:pointer', 'overflow:hidden',
        'border:1px solid rgba(255,255,255,.12)',
        'background:rgba(255,255,255,.04)', 'color:#f2f4f8',
        'transition:border-color .15s,background .15s,transform .12s',
      ].join(';');

      const badge = document.createElement('img');
      badge.src = p.logo;
      badge.alt = '';
      badge.loading = 'lazy';
      badge.style.cssText = 'width:44px;height:44px;border-radius:12px;object-fit:contain;background:' + p.bg + ';padding:8px';

      const name = document.createElement('span');
      name.textContent = p.name;
      name.style.cssText = 'font-size:12.5px;line-height:1.35;text-align:center;color:rgba(242,244,248,.86)';

      const tick = document.createElement('span');
      tick.setAttribute('aria-hidden', 'true');
      tick.style.cssText = [
        'position:absolute', 'top:6px', 'right:6px', 'width:16px', 'height:16px',
        'border-radius:50%', 'display:flex', 'align-items:center', 'justify-content:center',
        'font-size:10px', 'line-height:1', 'background:rgba(255,255,255,.12)',
        'color:transparent',
      ].join(';');
      tick.textContent = '✓';

      cell.append(badge, name, tick);
      cell.addEventListener('click', () => {
        const on = cell.getAttribute('aria-pressed') === 'true';
        const next = !on;
        cell.setAttribute('aria-pressed', String(next));
        cell.style.borderColor = next ? 'rgba(120,190,255,.85)' : 'rgba(255,255,255,.12)';
        cell.style.background = next ? 'rgba(90,150,230,.18)' : 'rgba(255,255,255,.04)';
        tick.style.background = next ? 'rgba(120,190,255,.95)' : 'rgba(255,255,255,.12)';
        tick.style.color = next ? '#0b1220' : 'transparent';
        if (next) cur.add(p.id); else cur.delete(p.id);
      });

      const on = cur.has(p.id);
      cell.setAttribute('aria-pressed', String(on));
      cell.style.borderColor = on ? 'rgba(120,190,255,.85)' : 'rgba(255,255,255,.12)';
      cell.style.background = on ? 'rgba(90,150,230,.18)' : 'rgba(255,255,255,.04)';
      tick.style.background = on ? 'rgba(120,190,255,.95)' : 'rgba(255,255,255,.12)';
      tick.style.color = on ? '#0b1220' : 'transparent';

      grid.appendChild(cell);
      cells.set(p.id, cell);
    });

    /* 底部操作：全选 / 取消 / 保存 */
    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:18px';

    const mkBtn = (text, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.cssText = [
        'padding:9px 16px', 'border-radius:11px', 'cursor:pointer',
        'font-size:13px', 'font-weight:600', 'border:1px solid',
        primary
          ? 'background:linear-gradient(135deg,#7db7ff,#5a8fe8);color:#08101f;border-color:transparent'
          : 'background:rgba(255,255,255,.06);color:rgba(242,244,248,.86);border-color:rgba(255,255,255,.14)',
        'transition:transform .12s,filter .15s',
      ].join(';');
      b.addEventListener('pointerdown', () => { b.style.transform = 'scale(.97)'; });
      b.addEventListener('pointerup', () => { b.style.transform = ''; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
      return b;
    };

    const allBtn = mkBtn('全选', false);
    allBtn.addEventListener('click', () => {
      const allOn = cur.size === ALL.length;
      cur.clear();
      if (!allOn) ALL.forEach((id) => cur.add(id));
      cells.forEach((cell, id) => {
        const on = !allOn && cur.has(id);
        cell.setAttribute('aria-pressed', String(on));
        cell.style.borderColor = on ? 'rgba(120,190,255,.85)' : 'rgba(255,255,255,.12)';
        cell.style.background = on ? 'rgba(90,150,230,.18)' : 'rgba(255,255,255,.04)';
        const t = cell.querySelector('span[aria-hidden]');
        if (t) {
          t.style.background = on ? 'rgba(120,190,255,.95)' : 'rgba(255,255,255,.12)';
          t.style.color = on ? '#0b1220' : 'transparent';
        }
      });
    });

    const cancel = mkBtn('取消', false);
    cancel.addEventListener('click', close);

    const ok = mkBtn('保存', true);
    ok.addEventListener('click', () => {
      /* 全不选没有意义（大厅会回退全部），这里按「至少留一个」处理 */
      const ids = cur.size ? ALL.filter((id) => cur.has(id)) : [ALL[0]];
      save(ids);
      close();
    });

    foot.append(allBtn, cancel, ok);
    ok.style.marginLeft = 'auto';

    card.append(head, sub, grid, foot);
    overlay.appendChild(card);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    ok.focus({ preventScroll: true });
  }

  window.LIZI_PLATFORM_PICKER = { open, close };

  function bind() {
    const row = document.getElementById('row-platforms');
    if (row && !row.dataset.pickerBound) {
      row.dataset.pickerBound = '1';
      row.addEventListener('click', open);
    }
    paintLabel(readSel());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
