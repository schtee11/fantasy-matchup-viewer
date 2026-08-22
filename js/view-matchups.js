/* ============================================================
   View: Matchups — one card per league, my team vs opponent
   ============================================================ */

function renderMatchups(host) {
  const m = state.model;
  const cards = m ? m.cards : state.cards;

  // Summary
  if (m && cards.length) {
    const a = m.agg;
    host.appendChild(summaryRow([
      statTile(String(a.leagues), a.leagues === 1 ? 'League' : 'Leagues'),
      a.winning + a.losing + a.tie ? statTile(String(a.winning), 'Winning', 'good') : null,
      a.winning + a.losing + a.tie ? statTile(String(a.losing), 'Losing', 'bad') : null,
      a.tie ? statTile(String(a.tie), 'Tied') : null,
      statTile(`${a.record.w}-${a.record.l}${a.record.t ? '-' + a.record.t : ''}`, 'Overall record'),
      a.liveGames ? statTile('<span class="live-dot"></span>LIVE', 'Games in progress', 'live-stat') : null
    ]));
  }

  // Toolbar
  const tb = toolbar();
  const left = tb.querySelector('.toolbar-left');
  left.appendChild(segmented(
    [{ value: 'all', label: 'All' }, { value: 'winning', label: 'Winning' }, { value: 'losing', label: 'Losing' }],
    state.filterResult, v => { state.filterResult = v; renderActive(); }
  ));
  left.appendChild(selectEl(
    [{ value: '*', label: 'All leagues' }, ...state.leagues.map(l => ({ value: l.league_id, label: l.name || l.league_id }))],
    state.filterLeague, v => { state.filterLeague = v; renderActive(); }, 'league-filter'
  ));
  const starBtn = $el('button', 'chip-btn' + (state.onlyStarred ? ' active' : ''), '★ Starred');
  starBtn.addEventListener('click', () => { state.onlyStarred = !state.onlyStarred; renderActive(); });
  left.appendChild(starBtn);

  const right = tb.querySelector('.toolbar-right');
  const anyOpen = cards.some(c => state.openLeagues.has(c.leagueId));
  const expandBtn = $el('button', 'chip-btn', anyOpen ? 'Collapse all' : 'Expand all');
  expandBtn.addEventListener('click', () => {
    if (anyOpen) state.openLeagues.clear();
    else cards.forEach(c => state.openLeagues.add(c.leagueId));
    renderActive();
  });
  right.appendChild(expandBtn);
  host.appendChild(tb);

  // Grid
  const grid = $el('div', 'dashboard');
  let list = cards;
  if (state.filterLeague !== '*') list = list.filter(c => c.leagueId === state.filterLeague);
  if (state.filterResult !== 'all') list = list.filter(c => c.result === state.filterResult);
  if (state.onlyStarred) list = list.filter(c => {
    const all = [...(c.me?.lineup || []), ...(c.opp?.lineup || [])];
    return all.some(p => p.pid && state.favorites.has(p.pid));
  });

  if (!cards.length) {
    grid.appendChild(emptyEl(state.user
      ? 'No leagues found for this user in the selected season.'
      : 'Enter your Sleeper username above and hit Load to see all your teams.'));
  } else if (!list.length) {
    grid.appendChild(emptyEl('No teams match the current filters.'));
  } else {
    for (const card of list) grid.appendChild(matchupCard(card));
  }
  host.appendChild(grid);
}

function matchupCard(card) {
  const el = $el('details', 'tcard result-' + card.result);
  if (state.openLeagues.has(card.leagueId)) el.open = true;
  el.addEventListener('toggle', () => {
    if (el.open) state.openLeagues.add(card.leagueId);
    else state.openLeagues.delete(card.leagueId);
  });

  const me = card.me, opp = card.opp;
  const summary = $el('summary', 'tcard-head');

  const top = $el('div', 'tcard-league');
  top.appendChild(avatarEl(card.leagueAvatar, card.leagueName, 'sm'));
  const lname = $el('div', 'tcard-league-name');
  lname.textContent = card.leagueName;
  top.appendChild(lname);
  top.appendChild($el('span', 'record-badge', `${card.record.w}-${card.record.l}${card.record.t ? '-' + card.record.t : ''}`));
  summary.appendChild(top);

  if (card.hasMatchup) {
    const score = $el('div', 'scoreline');
    const teamCol = (t, isMe, win) => {
      const col = $el('div', 'team-col' + (isMe ? ' me' : '') + (win ? ' winner' : ''));
      col.appendChild(avatarEl(t.avatar, t.name, 'md'));
      const info = $el('div', 'team-info');
      const nm = $el('div', 'team-name'); nm.textContent = t.name; info.appendChild(nm);
      const meta = $el('div', 'team-meta'); meta.textContent = t.yetToPlay > 0 ? `${t.yetToPlay} yet to play` : 'all played';
      info.appendChild(meta);
      col.appendChild(info);
      const pts = $el('div', 'team-pts'); pts.textContent = fmtPts(t.total); col.appendChild(pts);
      return col;
    };
    const meWin = card.result === 'winning', oppWin = card.result === 'losing';
    score.appendChild(teamCol(me, true, meWin));
    const vs = $el('div', 'vs ' + (meWin ? 'vs-win' : oppWin ? 'vs-loss' : 'vs-tie'));
    vs.textContent = card.result === 'tie' ? 'TIE' : meWin ? 'WIN' : oppWin ? 'LOSS' : 'VS';
    score.appendChild(vs);
    score.appendChild(teamCol(opp, false, oppWin));
    summary.appendChild(score);

    const total = me.total + opp.total;
    const pct = total > 0 ? (me.total / total) * 100 : 50;
    const bar = $el('div', 'winbar');
    const fill = $el('div', 'winbar-fill'); fill.style.width = pct.toFixed(1) + '%';
    bar.appendChild(fill);
    summary.appendChild(bar);
  } else {
    summary.appendChild($el('div', 'no-matchup', me ? `${me.name} · no matchup scheduled this week` : 'No matchup this week'));
  }

  const hint = $el('div', 'expand-hint');
  hint.innerHTML = `<span class="chev">▸</span> Head-to-head lineup`;
  summary.appendChild(hint);
  el.appendChild(summary);

  const body = $el('div', 'tcard-body');
  if (card.hasMatchup && me && opp) body.appendChild(lineupTable(card));
  else if (me) body.appendChild(singleLineup(me));
  el.appendChild(body);
  return el;
}

function lineupTable(card) {
  const me = card.me, opp = card.opp;
  const rows = Math.max(me.lineup.length, opp.lineup.length);
  const table = $el('div', 'lineup');

  const cell = (p, isMe, better, leagueId) => {
    const c = $el('div', 'lu-cell' + (isMe ? ' lu-me' : ' lu-opp') + (better ? ' lu-better' : ''));
    if (!p || p.empty) { c.innerHTML = `<span class="lu-empty">—</span>`; return c; }
    const key = p.pid + '@' + leagueId;
    const g = p.game || { text: '', kind: 'none' };
    const nm = `<span class="lu-name">${esc(p.name)}</span>${p.injury ? ' ' + injuryBadge(p.injury) : ''}`;
    const sub = `<span class="lu-team">${esc(p.team || 'FA')}</span> ${gameChipHtml(g)}`;
    if (isMe) c.innerHTML = `<div class="lu-pts">${ptsHtml(p.pts, key)}</div><div class="lu-txt">${nm}<div class="lu-sub">${sub}</div></div>${starHtml(p.pid, p.name)}`;
    else c.innerHTML = `${starHtml(p.pid, p.name)}<div class="lu-txt lu-right">${nm}<div class="lu-sub">${sub}</div></div><div class="lu-pts">${ptsHtml(p.pts, key)}</div>`;
    return c;
  };

  for (let i = 0; i < rows; i++) {
    const mp = me.lineup[i], op = opp.lineup[i];
    const slot = (mp && mp.slot) || (op && op.slot) || '-';
    const row = $el('div', 'lu-row');
    const mBetter = mp && op && mp.pts > op.pts && !mp.empty;
    const oBetter = mp && op && op.pts > mp.pts && !op.empty;
    row.appendChild(cell(mp, true, mBetter, card.leagueId));
    const s = $el('div', `lu-slot ${posClass(slot)}`); s.textContent = slot;
    row.appendChild(s);
    row.appendChild(cell(op, false, oBetter, card.leagueId));
    table.appendChild(row);
  }

  const totals = $el('div', 'lu-row lu-totals');
  const mt = $el('div', 'lu-cell lu-me' + (card.result === 'winning' ? ' lu-better' : ''));
  mt.innerHTML = `<div class="lu-pts">${fmtPts(me.total)}</div><div class="lu-txt">TOTAL</div>`;
  totals.appendChild(mt);
  totals.appendChild($el('div', 'lu-slot', 'Σ'));
  const ot = $el('div', 'lu-cell lu-opp' + (card.result === 'losing' ? ' lu-better' : ''));
  ot.innerHTML = `<div class="lu-txt lu-right">TOTAL</div><div class="lu-pts">${fmtPts(opp.total)}</div>`;
  totals.appendChild(ot);
  table.appendChild(totals);

  wireStars(table);
  return table;
}

function singleLineup(me) {
  const table = $el('div', 'lineup single');
  for (const p of me.lineup) {
    const row = $el('div', 'lu-row single-row');
    const s = $el('div', `lu-slot ${posClass(p.slot)}`); s.textContent = p.slot;
    row.appendChild(s);
    const c = $el('div', 'lu-cell lu-me');
    const g = p.game || { text: '', kind: 'none' };
    c.innerHTML = p.empty ? '<span class="lu-empty">—</span>'
      : `${starHtml(p.pid, p.name)}<div class="lu-txt"><span class="lu-name">${esc(p.name)}</span>${p.injury ? ' ' + injuryBadge(p.injury) : ''}<div class="lu-sub"><span class="lu-team">${esc(p.team || 'FA')}</span> ${gameChipHtml(g)}</div></div><div class="lu-pts">${fmtPts(p.pts)}</div>`;
    row.appendChild(c);
    table.appendChild(row);
  }
  wireStars(table);
  return table;
}
