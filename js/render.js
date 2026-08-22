/* ============================================================
   Render — Dashboard: summary bar, team matchup cards
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

// --- League filter options ---
function renderLeagueFilter() {
  const sel = $('#leagueFilter');
  if (!sel) return;
  const cur = state.filterLeague;
  sel.innerHTML = '';
  const all = $el('option', null, 'All leagues');
  all.value = '*';
  sel.appendChild(all);
  for (const lg of state.leagues) {
    const o = $el('option');
    o.value = lg.league_id;
    o.textContent = lg.name || lg.league_id;
    sel.appendChild(o);
  }
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '*';
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

// --- Avatar element (image or initials) ---
function avatarEl(url, name, size = 'md') {
  const wrap = $el('div', `avatar avatar-${size}`);
  if (url) {
    const img = $el('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = () => { img.remove(); wrap.textContent = initials(name); };
    wrap.appendChild(img);
  } else {
    wrap.textContent = initials(name);
  }
  return wrap;
}

// --- Summary bar across all leagues ---
function renderSummary() {
  const host = $('#summary');
  host.innerHTML = '';
  const cards = state.cards;
  if (!cards.length) { host.style.display = 'none'; return; }
  host.style.display = '';

  const withM = cards.filter(c => c.hasMatchup);
  const winning = withM.filter(c => c.result === 'winning').length;
  const losing = withM.filter(c => c.result === 'losing').length;
  const tied = withM.filter(c => c.result === 'tie').length;
  const totalRec = cards.reduce((a, c) => {
    a.w += c.record.w; a.l += c.record.l; a.t += c.record.t; return a;
  }, { w: 0, l: 0, t: 0 });
  const anyLive = state.schedule.some(g => g.live);

  const stat = (val, label, cls) => {
    const d = $el('div', 'stat' + (cls ? ' ' + cls : ''));
    d.appendChild($el('div', 'stat-val', String(val)));
    d.appendChild($el('div', 'stat-label', label));
    return d;
  };

  host.appendChild(stat(cards.length, cards.length === 1 ? 'League' : 'Leagues'));
  if (withM.length) {
    host.appendChild(stat(winning, 'Winning', 'good'));
    host.appendChild(stat(losing, 'Losing', 'bad'));
    if (tied) host.appendChild(stat(tied, 'Tied'));
  }
  host.appendChild(stat(`${totalRec.w}-${totalRec.l}${totalRec.t ? '-' + totalRec.t : ''}`, 'Overall record'));

  if (anyLive) {
    const live = $el('div', 'stat live-stat');
    live.innerHTML = `<div class="stat-val"><span class="live-dot"></span>LIVE</div><div class="stat-label">Games in progress</div>`;
    host.appendChild(live);
  }
}

// --- One team-matchup card ---
function matchupCard(card) {
  const el = $el('details', 'tcard result-' + card.result);
  const me = card.me, opp = card.opp;

  // ---- Summary (always visible) ----
  const summary = $el('summary', 'tcard-head');

  // League row
  const top = $el('div', 'tcard-league');
  top.appendChild(avatarEl(card.leagueAvatar, card.leagueName, 'sm'));
  const lname = $el('div', 'tcard-league-name');
  lname.textContent = card.leagueName;
  top.appendChild(lname);
  const rec = $el('span', 'record-badge', `${card.record.w}-${card.record.l}${card.record.t ? '-' + card.record.t : ''}`);
  top.appendChild(rec);
  summary.appendChild(top);

  if (card.hasMatchup) {
    // Scoreline: me vs opp
    const score = $el('div', 'scoreline');

    const teamCol = (t, isMe, win) => {
      const col = $el('div', 'team-col' + (isMe ? ' me' : '') + (win ? ' winner' : ''));
      col.appendChild(avatarEl(t.avatar, t.name, 'md'));
      const info = $el('div', 'team-info');
      const nm = $el('div', 'team-name');
      nm.textContent = t.name;
      info.appendChild(nm);
      const meta = $el('div', 'team-meta');
      meta.textContent = t.yetToPlay > 0 ? `${t.yetToPlay} yet to play` : 'all played';
      info.appendChild(meta);
      col.appendChild(info);
      const pts = $el('div', 'team-pts');
      pts.textContent = fmtPts(t.total);
      col.appendChild(pts);
      return col;
    };

    const meWin = card.result === 'winning';
    const oppWin = card.result === 'losing';
    score.appendChild(teamCol(me, true, meWin));
    const vs = $el('div', 'vs');
    vs.innerHTML = card.result === 'tie' ? 'TIE' : (meWin ? 'WIN' : oppWin ? 'LOSS' : 'VS');
    vs.className = 'vs ' + (meWin ? 'vs-win' : oppWin ? 'vs-loss' : 'vs-tie');
    score.appendChild(vs);
    score.appendChild(teamCol(opp, false, oppWin));
    summary.appendChild(score);

    // Win bar
    const total = me.total + opp.total;
    const pct = total > 0 ? (me.total / total) * 100 : 50;
    const bar = $el('div', 'winbar');
    const fill = $el('div', 'winbar-fill');
    fill.style.width = pct.toFixed(1) + '%';
    bar.appendChild(fill);
    summary.appendChild(bar);
  } else {
    const noM = $el('div', 'no-matchup');
    noM.textContent = me ? `${me.name} · no matchup scheduled this week` : 'No matchup this week';
    summary.appendChild(noM);
  }

  const hint = $el('div', 'expand-hint');
  hint.innerHTML = `<span class="chev">▸</span> Head-to-head lineup`;
  summary.appendChild(hint);
  el.appendChild(summary);

  // ---- Expanded body: side-by-side starters ----
  const body = $el('div', 'tcard-body');
  if (card.hasMatchup && me && opp) {
    body.appendChild(lineupTable(card));
  } else if (me) {
    body.appendChild(singleLineup(me));
  }
  el.appendChild(body);

  return el;
}

// --- Head-to-head lineup table (me | slot | opp) ---
function lineupTable(card) {
  const me = card.me, opp = card.opp;
  const rows = Math.max(me.lineup.length, opp.lineup.length);
  const table = $el('div', 'lineup');

  const cell = (p, isMe, better) => {
    const c = $el('div', 'lu-cell' + (isMe ? ' lu-me' : ' lu-opp') + (better ? ' lu-better' : ''));
    if (!p || p.empty) {
      c.innerHTML = `<span class="lu-empty">—</span>`;
      return c;
    }
    const star = p.pid
      ? `<button class="star ${state.favorites.has(p.pid) ? 'on' : ''}" data-pid="${p.pid}" title="Star player" aria-label="Star ${esc(p.name)}">${state.favorites.has(p.pid) ? '★' : '☆'}</button>`
      : '';
    const g = p.game || { text: '', kind: 'none' };
    const nameHtml = `<span class="lu-name">${esc(p.name)}</span>${p.injury ? ' ' + injuryBadge(p.injury) : ''}`;
    const teamHtml = `<span class="lu-team">${esc(p.team || 'FA')}</span> <span class="game game-${g.kind}">${esc(g.text)}</span>`;
    if (isMe) {
      c.innerHTML = `<div class="lu-pts">${fmtPts(p.pts)}</div><div class="lu-txt">${nameHtml}<div class="lu-sub">${teamHtml}</div></div>${star}`;
    } else {
      c.innerHTML = `${star}<div class="lu-txt lu-right">${nameHtml}<div class="lu-sub">${teamHtml}</div></div><div class="lu-pts">${fmtPts(p.pts)}</div>`;
    }
    return c;
  };

  for (let i = 0; i < rows; i++) {
    const mp = me.lineup[i], op = opp.lineup[i];
    const slot = (mp && mp.slot) || (op && op.slot) || '-';
    const row = $el('div', 'lu-row');
    const mBetter = mp && op && mp.pts > op.pts && !mp.empty;
    const oBetter = mp && op && op.pts > mp.pts && !op.empty;
    row.appendChild(cell(mp, true, mBetter));
    const s = $el('div', `lu-slot ${posClass(slot)}`);
    s.textContent = slot;
    row.appendChild(s);
    row.appendChild(cell(op, false, oBetter));
    table.appendChild(row);
  }

  // Totals row
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

// --- Single lineup (no opponent) ---
function singleLineup(me) {
  const table = $el('div', 'lineup single');
  for (const p of me.lineup) {
    const row = $el('div', 'lu-row single-row');
    const s = $el('div', `lu-slot ${posClass(p.slot)}`);
    s.textContent = p.slot;
    row.appendChild(s);
    const g = p.game || { text: '', kind: 'none' };
    const star = p.pid
      ? `<button class="star ${state.favorites.has(p.pid) ? 'on' : ''}" data-pid="${p.pid}" aria-label="Star ${esc(p.name)}">${state.favorites.has(p.pid) ? '★' : '☆'}</button>`
      : '';
    const c = $el('div', 'lu-cell lu-me');
    c.innerHTML = p.empty ? '<span class="lu-empty">—</span>'
      : `${star}<div class="lu-txt"><span class="lu-name">${esc(p.name)}</span>${p.injury ? ' ' + injuryBadge(p.injury) : ''}<div class="lu-sub"><span class="lu-team">${esc(p.team || 'FA')}</span> <span class="game game-${g.kind}">${esc(g.text)}</span></div></div><div class="lu-pts">${fmtPts(p.pts)}</div>`;
    row.appendChild(c);
    table.appendChild(row);
  }
  wireStars(table);
  return table;
}

function wireStars(scope) {
  scope.querySelectorAll('.star').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const pid = btn.dataset.pid;
      toggleFavorite(pid);
      const on = state.favorites.has(pid);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '★' : '☆';
    });
  });
}

// --- Render the whole dashboard grid ---
function renderDashboard() {
  renderSummary();
  const host = $('#dashboard');
  host.innerHTML = '';

  let cards = state.cards;
  if (state.filterLeague !== '*') cards = cards.filter(c => c.leagueId === state.filterLeague);
  if (state.filterResult !== 'all') cards = cards.filter(c => c.result === state.filterResult);
  if (state.onlyStarred) {
    cards = cards.filter(c => {
      const all = [...(c.me?.lineup || []), ...(c.opp?.lineup || [])];
      return all.some(p => p.pid && state.favorites.has(p.pid));
    });
  }

  if (!state.cards.length) {
    host.appendChild($el('div', 'empty', state.user
      ? 'No leagues found for this user in the selected season.'
      : 'Enter your Sleeper username above and hit Load to see all your teams.'));
    return;
  }
  if (!cards.length) {
    host.appendChild($el('div', 'empty', 'No teams match the current filters.'));
    return;
  }

  for (const card of cards) host.appendChild(matchupCard(card));
}
