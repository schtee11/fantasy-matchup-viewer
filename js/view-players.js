/* ============================================================
   View: Players — every rostered starter across all leagues
   ============================================================ */

function renderPlayers(host) {
  const m = state.model;
  if (!m) { host.appendChild(emptyEl('Load your teams to see your players.')); return; }
  const a = m.agg;

  host.appendChild(summaryRow([
    statTile(String(a.starters), 'Starters'),
    a.playing ? statTile('<span class="live-dot"></span>' + a.playing, 'Playing now', 'live-stat') : null,
    statTile(String(a.upcoming), 'Yet to play'),
    statTile(String(a.done), 'Done'),
    statTile(fmtPts1(a.livePts), 'Live pts', 'good')
  ]));

  // Toolbar
  const tb = toolbar();
  const left = tb.querySelector('.toolbar-left');
  left.appendChild(segmented(
    [{ value: 'all', label: 'All' }, { value: 'live', label: 'Playing' }, { value: 'pre', label: 'Upcoming' }, { value: 'final', label: 'Done' }],
    state.playerStatus, v => { state.playerStatus = v; renderActive(); }
  ));
  left.appendChild(selectEl(
    [{ value: 'all', label: 'All positions' }, ...['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map(p => ({ value: p, label: p }))],
    state.playerPos, v => { state.playerPos = v; renderActive(); }, 'league-filter'
  ));
  left.appendChild(selectEl(
    [{ value: '*', label: 'All leagues' }, ...state.leagues.map(l => ({ value: l.league_id, label: l.name || l.league_id }))],
    state.playerLeague, v => { state.playerLeague = v; renderActive(); }, 'league-filter'
  ));
  const starBtn = $el('button', 'chip-btn' + (state.onlyStarred ? ' active' : ''), '★ Starred');
  starBtn.addEventListener('click', () => { state.onlyStarred = !state.onlyStarred; renderActive(); });
  left.appendChild(starBtn);

  const right = tb.querySelector('.toolbar-right');
  right.appendChild($el('span', 'sort-label', 'Sort'));
  right.appendChild(selectEl(
    [{ value: 'pts', label: 'Points' }, { value: 'status', label: 'Game status' }, { value: 'exposure', label: 'Exposure' }, { value: 'pos', label: 'Position' }, { value: 'name', label: 'Name' }],
    state.playerSort, v => { state.playerSort = v; renderActive(); }, 'league-filter'
  ));
  host.appendChild(tb);

  // Jump-from-game filter chip
  if (state.jumpTeams && state.jumpTeams.length) {
    const chip = $el('div', 'jump-chip');
    chip.innerHTML = `Filtered to <strong>${esc(state.jumpTeams.join(' / '))}</strong> `;
    const x = $el('button', 'jump-x', '✕');
    x.addEventListener('click', () => { state.jumpTeams = null; renderActive(); });
    chip.appendChild(x);
    host.appendChild(chip);
  }

  // Filter
  let list = m.playerList.slice();
  if (state.playerPos !== 'all') list = list.filter(p => (p.pos || '').toUpperCase() === state.playerPos);
  if (state.playerStatus !== 'all') list = list.filter(p => p.game.kind === state.playerStatus);
  if (state.playerLeague !== '*') list = list.filter(p => p.leagues.some(l => l.id === state.playerLeague));
  if (state.onlyStarred) list = list.filter(p => state.favorites.has(p.pid));
  if (state.jumpTeams && state.jumpTeams.length) {
    const set = new Set(state.jumpTeams.map(normalizeTeamTag));
    list = list.filter(p => set.has(p.team));
  }

  // Sort
  const statusRank = { live: 0, pre: 1, final: 2, bye: 3, none: 4 };
  const cmp = {
    pts: (a, b) => b.totalPts - a.totalPts,
    exposure: (a, b) => b.exposure - a.exposure || b.totalPts - a.totalPts,
    status: (a, b) => statusRank[a.game.kind] - statusRank[b.game.kind] || b.totalPts - a.totalPts,
    pos: (a, b) => (a.pos || '').localeCompare(b.pos || '') || b.totalPts - a.totalPts,
    name: (a, b) => a.name.localeCompare(b.name)
  }[state.playerSort] || ((a, b) => b.totalPts - a.totalPts);
  list.sort(cmp);

  if (!list.length) { host.appendChild(emptyEl('No players match the current filters.')); return; }

  const wrap = $el('div', 'ptable');
  const head = $el('div', 'prow phead');
  head.innerHTML = `<div></div><div>Player</div><div>Game</div><div>Leagues</div><div class="pr-pts">Pts</div>`;
  wrap.appendChild(head);
  for (const p of list) wrap.appendChild(playerRow(p));
  host.appendChild(wrap);
  wireStars(wrap);
}

function playerRow(p) {
  const row = $el('div', 'prow' + (p.game.kind === 'live' ? ' is-live' : ''));

  const c0 = $el('div', 'pr-pos');
  c0.innerHTML = posChipHtml(p.pos);
  row.appendChild(c0);

  const c1 = $el('div', 'pr-name');
  c1.innerHTML = `${starHtml(p.pid, p.name)}<div class="pr-name-txt"><span class="lu-name">${esc(p.name)}</span>${p.injury ? ' ' + injuryBadge(p.injury) : ''}`
    + `${p.exposure > 1 ? ` <span class="exp-badge" title="Rostered in ${p.exposure} leagues">×${p.exposure}</span>` : ''}`
    + `<div class="pr-team">${esc(p.team || 'FA')}</div></div>`;
  row.appendChild(c1);

  const c2 = $el('div', 'pr-game');
  c2.innerHTML = gameChipHtml(p.game);
  row.appendChild(c2);

  const c3 = $el('div', 'pr-leagues');
  for (const l of p.leagues.slice().sort((a, b) => b.pts - a.pts)) {
    const key = p.pid + '@' + l.id;
    const chip = $el('span', 'lchip result-' + l.result);
    chip.innerHTML = `<span class="lchip-name">${esc(l.name)}</span> <span class="lchip-slot ${posClass(l.slot)}">${esc(l.slot)}</span> ${ptsHtml(l.pts, key)}`;
    c3.appendChild(chip);
  }
  row.appendChild(c3);

  const c4 = $el('div', 'pr-pts');
  c4.innerHTML = ptsHtml(p.totalPts, null, 'pr-total');
  row.appendChild(c4);

  return row;
}
