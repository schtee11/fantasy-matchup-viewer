/* ============================================================
   Render Common — shared UI atoms used by all views
   ============================================================ */

// --- Week options ---
function renderWeeks(n = 18) {
  const sel = $('#week');
  sel.innerHTML = '';
  for (let w = 1; w <= n; w++) {
    const o = $el('option');
    o.value = String(w);
    o.textContent = `Week ${w}`;
    sel.appendChild(o);
  }
}

// --- Injury badge ---
function injuryBadge(status) {
  if (!status) return '';
  const map = {
    Questionable: ['inj-q', 'Q'], Doubtful: ['inj-d', 'D'],
    Out: ['inj-out', 'OUT'], IR: ['inj-ir', 'IR'],
    PUP: ['inj-pup', 'PUP'], Suspended: ['inj-sus', 'SUS'], COV: ['inj-sus', 'COV']
  };
  const info = map[status] || ['inj-q', status.slice(0, 3).toUpperCase()];
  return `<span class="inj ${info[0]}" title="${esc(status)}">${esc(info[1])}</span>`;
}

// --- Avatar element ---
function avatarEl(url, name, size = 'md') {
  const wrap = $el('div', `avatar avatar-${size}`);
  if (url) {
    const img = $el('img');
    img.src = url; img.alt = ''; img.loading = 'lazy';
    img.onerror = () => { img.remove(); wrap.textContent = initials(name); };
    wrap.appendChild(img);
  } else {
    wrap.textContent = initials(name);
  }
  return wrap;
}

// --- Position chip ---
function posChipHtml(pos) {
  const p = slotLabel(pos);
  return `<span class="pchip ${posClass(pos)}">${esc(p)}</span>`;
}

// --- Game status chip ---
function gameChipHtml(game) {
  const g = game || { text: '', kind: 'none' };
  return `<span class="game game-${g.kind}">${esc(g.text)}</span>`;
}

// --- Points value with flash-on-increase ---
function ptsHtml(pts, key, extraCls = '') {
  const bump = key && state.bumped.has(key) ? ' bump' : '';
  return `<span class="pts${extraCls ? ' ' + extraCls : ''}${bump}">${fmtPts(pts)}</span>`;
}

// --- Star button ---
function starHtml(pid, name) {
  if (!pid) return '';
  const on = state.favorites.has(pid);
  return `<button class="star ${on ? 'on' : ''}" data-pid="${esc(pid)}" title="Star player" aria-label="Star ${esc(name)}">${on ? '★' : '☆'}</button>`;
}
function wireStars(scope) {
  scope.querySelectorAll('.star').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const pid = btn.dataset.pid;
      toggleFavorite(pid);
      const on = state.favorites.has(pid);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
    });
  });
}

// --- Summary stat tiles ---
function statTile(val, label, cls) {
  const d = $el('div', 'stat' + (cls ? ' ' + cls : ''));
  const v = $el('div', 'stat-val');
  v.innerHTML = val;
  d.appendChild(v);
  d.appendChild($el('div', 'stat-label', label));
  return d;
}
function summaryRow(tiles) {
  const row = $el('div', 'summary');
  for (const t of tiles) if (t) row.appendChild(t);
  return row;
}

// --- A reusable toolbar container ---
function toolbar() {
  const t = $el('div', 'toolbar');
  t.appendChild($el('div', 'toolbar-left'));
  t.appendChild($el('div', 'toolbar-right'));
  return t;
}

// --- Segmented control (tabs) ---
function segmented(options, current, onPick) {
  const wrap = $el('div', 'tabs');
  for (const o of options) {
    const b = $el('button', 'result-tab' + (o.value === current ? ' active' : ''), o.label);
    b.addEventListener('click', () => onPick(o.value));
    wrap.appendChild(b);
  }
  return wrap;
}

// --- Select dropdown ---
function selectEl(options, current, onChange, cls = '') {
  const sel = $el('select', cls);
  for (const o of options) {
    const opt = $el('option', null, o.label);
    opt.value = o.value;
    sel.appendChild(opt);
  }
  sel.value = options.some(o => o.value === current) ? current : options[0]?.value;
  sel.addEventListener('change', e => onChange(e.target.value));
  return sel;
}

// --- Empty state ---
function emptyEl(text) { return $el('div', 'empty', text); }
