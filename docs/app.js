(() => {
  const $ = s => document.querySelector(s);
  const state = { data: null, tab: 'internal', unit: '', q: '' };
  const PW_KEY = 'dir_pw';

  /* ---------- 解密 ---------- */
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function decrypt(password) {
    const e = window.ENCRYPTED_DATA;
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(e.salt), iterations: e.iter, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(e.iv) }, key, b64(e.ct));
    return JSON.parse(new TextDecoder().decode(buf));
  }

  /* ---------- 工具 ---------- */
  const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const unitLabel = u => u.replace(/^\d+-?/, '') || u;
  const norm = s => s.replace(/[\s\u3000-]+/g, '').toLowerCase();

  function hi(text, q) {
    const t = esc(text);
    if (!q) return t;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s\u3000]+/g, ''), 'gi');
    return t.replace(re, m => `<mark>${m}</mark>`);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1600);
  }

  /* ---------- 資料處理 ---------- */
  const rows = () => state.data[state.tab];

  function units() {
    const map = new Map();
    for (const r of rows()) map.set(r.u, (map.get(r.u) || 0) + 1);
    return [...map].map(([u, n]) => ({ u, n }));
  }

  function filtered() {
    const q = norm(state.q);
    return rows().filter(r => {
      if (!q && state.unit && r.u !== state.unit) return false;
      if (!q) return true;
      return norm(r.u + r.s + r.t + r.n + r.p.join('')).includes(q);
    });
  }

  /* ---------- 畫面 ---------- */
  function renderSide() {
    const us = units();
    const total = rows().length;
    $('#side').innerHTML =
      `<button data-unit="" class="${state.unit === '' ? 'active' : ''}"><span>全部</span><span class="badge">${total}</span></button>` +
      us.map(x => `<button data-unit="${esc(x.u)}" class="${state.unit === x.u ? 'active' : ''}"><span>${esc(unitLabel(x.u))}</span><span class="badge">${x.n}</span></button>`).join('');
    $('#unitSelect').innerHTML =
      `<option value="">全部（${total}）</option>` +
      us.map(x => `<option value="${esc(x.u)}" ${state.unit === x.u ? 'selected' : ''}>${esc(unitLabel(x.u))}（${x.n}）</option>`).join('');
  }

  function rowHTML(r, q) {
    const name = r.n || r.s;
    const chips = r.p.map(p => `<button class="ext" data-ext="${esc(p)}" title="${state.tab === 'internal' ? '查詢共用此分機的人員' : '點擊複製'}">${hi(p, q)}</button>`).join('');
    return `<div class="row">
      <div class="c-name ${r.n ? '' : 'dim'}">${hi(name, q)}</div>
      <div class="c-title">${hi(r.t, q)}</div>
      <div class="c-ext">${chips}</div></div>`;
  }

  function renderList() {
    const list = filtered();
    const q = state.q.trim();
    const box = $('#list');

    $('#status').textContent = q
      ? `搜尋「${q}」：共 ${list.length} 筆`
      : `共 ${list.length} 筆`;

    if (!list.length) { box.innerHTML = '<div class="empty">找不到符合的資料</div>'; return; }

    // 依 單位 → 子單位 分組（保持資料原順序）
    const byUnit = new Map();
    for (const r of list) {
      if (!byUnit.has(r.u)) byUnit.set(r.u, new Map());
      const subs = byUnit.get(r.u);
      if (!subs.has(r.s)) subs.set(r.s, []);
      subs.get(r.s).push(r);
    }
    const showUnitHead = !state.unit || q;
    let html = '';
    for (const [u, subs] of byUnit) {
      if (showUnitHead) html += `<h2 class="unit-head">${hi(unitLabel(u), q)}</h2>`;
      for (const [s, rs] of subs) {
        html += `<section class="group"><div class="group-head">${hi(s, q)}<span class="badge">${rs.length}</span></div>${rs.map(r => rowHTML(r, q)).join('')}</section>`;
      }
    }
    box.innerHTML = html;
  }

  function render() { renderSide(); renderList(); }

  /* ---------- 事件 ---------- */
  function setUnit(u) {
    state.unit = u; state.q = ''; $('#q').value = '';
    render(); window.scrollTo({ top: 0 });
  }

  function bind() {
    $('#side').addEventListener('click', e => {
      const b = e.target.closest('button[data-unit]'); if (b) setUnit(b.dataset.unit);
    });
    $('#unitSelect').addEventListener('change', e => setUnit(e.target.value));

    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
      state.tab = b.dataset.tab; state.unit = '';
      render(); window.scrollTo({ top: 0 });
    }));

    let timer;
    $('#q').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        state.q = e.target.value;
        if (state.q.trim()) state.unit = '';
        render();
      }, 120);
    });

    $('#list').addEventListener('click', e => {
      const b = e.target.closest('.ext'); if (!b) return;
      const ext = b.dataset.ext;
      if (state.tab === 'internal') {
        state.q = ext; state.unit = ''; $('#q').value = ext;
        render(); window.scrollTo({ top: 0 });
      } else {
        navigator.clipboard?.writeText(ext).then(() => toast(`已複製 ${ext}`), () => toast(ext));
      }
    });

    $('#logout').addEventListener('click', () => {
      try { sessionStorage.removeItem(PW_KEY); } catch {}
      location.reload();
    });
  }

  /* ---------- 進入 ---------- */
  async function enter(password) {
    state.data = await decrypt(password);
    try { sessionStorage.setItem(PW_KEY, password); } catch {}
    $('#updated').textContent = state.data.updated;
    $('#gate').hidden = true; $('#app').hidden = false;
    bind(); render();
  }

  $('#gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#gateBtn'), err = $('#gateErr');
    btn.disabled = true; btn.textContent = '驗證中…'; err.textContent = '';
    try {
      await enter($('#pw').value);
    } catch {
      err.textContent = '密碼錯誤，請再試一次';
      $('#pw').select();
    } finally {
      btn.disabled = false; btn.textContent = '進入';
    }
  });

  // 同一個分頁重新整理時免再輸入
  (async () => {
    let saved = null;
    try { saved = sessionStorage.getItem(PW_KEY); } catch {}
    if (saved) { try { await enter(saved); } catch { try { sessionStorage.removeItem(PW_KEY); } catch {} } }
  })();
})();
