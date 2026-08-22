/* ============================================================
   View: Games — live NFL slate + your players in each game
   ============================================================ */

function renderGames(host) {
  const m = state.model;
  if (!m) { host.appendChild(emptyEl('Load your teams to see the game slate.')); return; }

  const games = m.games;
  const live = games.filter(g => g.live).length;
  const pre = games.filter(g => g.status === 'pre').length;
  const done = games.filter(g => g.status === 'Final').length;

  host.appendChild(summaryRow([
    statTile(String(games.length), 'Games'),
    live ? statTile('<span class="live-dot"></span>' + live, 'Live now', 'live-stat') : null,
    statTile(String(pre), 'Upcoming'),
    statTile(String(done), 'Final'),
    statTile(fmtPts1(m.agg.livePts), 'Your live pts', 'good')
  ]));

  const tb = toolbar();
  tb.querySelector('.toolbar-left').appendChild(segmented(
    [{ value: 'all', label: 'All games' }, { value: 'mine', label: 'With my players' }],
    state.gameFilter, v => { state.gameFilter = v; renderActive(); }
  ));
  host.appendChild(tb);

  let list = games;
  if (state.gameFilter === 'mine') list = list.filter(g => g.mineCount > 0);

  const grid = $el('div', 'games-grid');
  if (!list.length) grid.appendChild(emptyEl('No games to show.'));
  else for (const g of list) grid.appendChild(gameCard(g));
  host.appendChild(grid);
  wireStars(grid);
}

function gameCard(g) {
  const card = $el('div', 'gcard' + (g.live ? ' live' : '') + (g.redzone ? ' redzone' : ''));

  // Status line
  const head = $el('div', 'gcard-head');
  const st = $el('div', 'gcard-status');
  if (g.live) {
    st.innerHTML = `<span class="live-dot"></span><span class="g-live">${esc(g.status)}</span>`;
    if (g.redzone) st.innerHTML += ` <span class="rz-badge">RED ZONE</span>`;
  } else if (g.status === 'Final') {
    st.innerHTML = `<span class="g-final">Final</span>`;
  } else {
    const ko = g.kickoff ? new Date(g.kickoff) : null;
    st.innerHTML = `<span class="g-pre">${ko ? esc(ko.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })) : 'TBA'}</span>`;
  }
  head.appendChild(st);
  if (g.broadcast) head.appendChild($el('span', 'gcard-tv', g.broadcast));
  card.appendChild(head);

  // Teams
  const teamRow = (abbr, score, rec, hasBall, leads) => {
    const r = $el('div', 'g-team' + (leads ? ' leads' : ''));
    const left = $el('div', 'g-team-id');
    left.innerHTML = `<span class="g-abbr">${esc(abbr)}</span>${hasBall ? '<span class="ball" title="Has possession">🏈</span>' : ''}${rec ? `<span class="g-rec">${esc(rec)}</span>` : ''}`;
    r.appendChild(left);
    const sc = $el('div', 'g-score', score == null ? '—' : String(score));
    r.appendChild(sc);
    return r;
  };
  const aLeads = g.away_score != null && g.home_score != null && g.away_score > g.home_score;
  const hLeads = g.away_score != null && g.home_score != null && g.home_score > g.away_score;
  const teams = $el('div', 'g-teams');
  teams.appendChild(teamRow(g.away, g.away_score, g.away_rec, g.possession === g.away, aLeads));
  teams.appendChild(teamRow(g.home, g.home_score, g.home_rec, g.possession === g.home, hLeads));
  card.appendChild(teams);

  // Live detail
  if (g.live && (g.downDistance || g.lastPlay)) {
    const det = $el('div', 'g-detail');
    if (g.downDistance) det.appendChild($el('div', 'g-dd', g.downDistance));
    if (g.lastPlay) det.appendChild($el('div', 'g-lastplay', g.lastPlay));
    card.appendChild(det);
  }

  // My players in this game
  const mine = $el('div', 'g-mine');
  if (g.mineCount) {
    const label = $el('div', 'g-mine-label');
    label.innerHTML = `<span>Your players</span><span class="g-mine-sum">${g.mineCount} · ${fmtPts1(g.minePts)} pts</span>`;
    mine.appendChild(label);
    const chips = $el('div', 'g-chips');
    for (const p of g.mine) {
      const chip = $el('div', 'pchip-row');
      const key0 = p.pid + '@' + (p.leagues[0]?.id || '');
      chip.innerHTML = `${posChipHtml(p.pos)}<span class="pchip-name">${esc(p.name)}</span>`
        + (p.exposure > 1 ? `<span class="exp-badge" title="Rostered in ${p.exposure} leagues">×${p.exposure}</span>` : '')
        + `${p.injury ? injuryBadge(p.injury) : ''}<span class="pchip-pts">${ptsHtml(p.totalPts, key0)}</span>`;
      chips.appendChild(chip);
    }
    mine.appendChild(chips);
  } else {
    mine.appendChild($el('div', 'g-mine-none', 'No players of yours in this game'));
  }
  card.appendChild(mine);

  // Villains note
  if (g.villainsIn && g.villainsIn.length) {
    const v = $el('div', 'g-villains');
    v.textContent = `⚔ ${g.villainsIn.length} against you`;
    card.appendChild(v);
  }

  // Click → Players view filtered to this game's teams
  card.style.cursor = 'pointer';
  card.addEventListener('click', e => {
    if (e.target.closest('.star')) return;
    state.playerLeague = '*';
    state.playerPos = 'all';
    state.playerStatus = 'all';
    state.jumpTeams = [g.away, g.home];
    switchView('players');
  });
  return card;
}
