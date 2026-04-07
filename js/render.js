/* ============================================================
   Render — DOM rendering for matches, players, sparklines,
            bye weeks, modal, and watchlist
   ============================================================ */

// --- Render Week Options ---
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

// --- Render League Options ---
function renderLeagues() {
  const sel = $('#league');
  sel.innerHTML = '';
  const any = $el('option');
  any.value = '*';
  any.textContent = 'All leagues';
  sel.appendChild(any);
  for (const lg of state.leagues) {
    const o = $el('option');
    o.value = lg.league_id;
    o.textContent = lg.name || lg.league_id;
    sel.appendChild(o);
  }
}

// --- Injury Badge (F2) ---
function injuryBadge(injuryStatus) {
  if (!injuryStatus) return '';
  const map = {
    'Questionable': { cls: 'inj-questionable', label: 'Q' },
    'Doubtful': { cls: 'inj-doubtful', label: 'D' },
    'Out': { cls: 'inj-out', label: 'OUT' },
    'IR': { cls: 'inj-ir', label: 'IR' },
    'PUP': { cls: 'inj-pup', label: 'PUP' },
    'Suspended': { cls: 'inj-sus', label: 'SUS' }
  };
  const info = map[injuryStatus];
  if (!info) return `<span class="inj inj-questionable" title="${injuryStatus}">${injuryStatus.substring(0, 3).toUpperCase()}</span>`;
  return `<span class="inj ${info.cls}" title="${injuryStatus}">${info.label}</span>`;
}

// --- Sparkline SVG (F7) ---
function renderSparkline(points) {
  if (!points || points.length < 2) return '';
  const w = 50, h = 16, pad = 2;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trending = points[points.length - 1] >= points[0];
  const color = trending ? '#34d399' : '#f87171';
  return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${coords.join(' ')}" />
  </svg>`;
}

// --- Build Player List ---
function buildList(rows, options = {}) {
  const { showOpponentLabel = false, showFavStar = true } = options;
  const list = $el('div', 'list');

  // Header row
  const header = $el('div', 'player');
  header.style.position = 'sticky';
  header.style.top = '0';
  header.style.zIndex = '2';
  header.style.backdropFilter = 'blur(6px)';
  header.innerHTML = `<strong>Player</strong><strong>Pos</strong><strong>Team</strong><strong>League</strong><strong>Pts</strong><strong>Trend</strong>`;
  list.appendChild(header);

  for (const r of rows) {
    const row = $el('div', 'player' + (r.isOpponent ? ' opponent-row' : ''));
    const injBadge = injuryBadge(r.injury);
    const sparkSvg = renderSparkline(r.sparkline);
    const oppLabel = r.isOpponent ? ' <span class="muted" style="font-size:11px">(OPP)</span>' : '';

    let starHtml = '';
    if (showFavStar && r.pid) {
      const isActive = state.favorites.has(r.pid);
      starHtml = `<button class="star-btn ${isActive ? 'active' : ''}" data-pid="${r.pid}" title="Toggle favorite" aria-label="Toggle favorite for ${r.name}">${isActive ? '\u2605' : '\u2606'}</button>`;
    }

    row.innerHTML = `
      <div class="player-name-cell">${starHtml}${r.name}${oppLabel} ${injBadge}</div>
      <div class="muted">${r.pos}</div>
      <div>${r.team}</div>
      <div class="muted">${r.league}</div>
      <div><strong>${r.pts}</strong></div>
      <div>${sparkSvg}</div>
    `;
    list.appendChild(row);
  }

  // Wire up star buttons
  list.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.dataset.pid;
      toggleFavorite(pid);
      btn.classList.toggle('active');
      btn.textContent = state.favorites.has(pid) ? '\u2605' : '\u2606';
      renderWatchlist(); // update watchlist section
    });
  });

  return list;
}

// --- Render Match Cards ---
function renderMatches() {
  const host = $('#matches');
  host.innerHTML = '';
  if (!state.schedule.length) {
    host.appendChild($el('div', 'empty', 'No games found for this week.'));
    return;
  }

  const ownedByTeam = new Map();
  for (const [, entry] of state.owned) {
    const t = normalizeTeamTag(entry.player?.team);
    if (!t) continue;
    ownedByTeam.set(t, (ownedByTeam.get(t) || 0) + 1);
  }

  const sched = [...state.schedule].sort((a, b) => {
    const ta = a.kickoff ? new Date(a.kickoff).getTime() : 0;
    const tb = b.kickoff ? new Date(b.kickoff).getTime() : 0;
    return ta - tb;
  });

  for (const g of sched) {
    const card = $el('div', 'match');
    const teams = $el('div', 'teams');
    const txt = (label, score) => (score == null ? label : `${label} ${score}`);
    teams.innerHTML = `<span>${txt(g.away, g.away_score)}</span><span> @ </span><span>${txt(g.home, g.home_score)}</span>`;
    card.appendChild(teams);

    const sub = $el('div', 'sub');
    const ko = g.kickoff ? new Date(g.kickoff) : null;
    sub.textContent = g.status && g.status !== 'Scheduled'
      ? g.status
      : (ko ? `Kick: ${ko.toLocaleString()}` : 'Kick: TBA');
    card.appendChild(sub);

    const counts = $el('div');
    const ap = ownedByTeam.get(normalizeTeamTag(g.away)) || 0;
    const hp = ownedByTeam.get(normalizeTeamTag(g.home)) || 0;
    counts.appendChild($el('span', 'pill', `${g.away} \u00B7 ${ap} on your roster`));
    counts.appendChild($el('span', 'pill', `${g.home} \u00B7 ${hp} on your roster`));
    counts.style.display = 'flex';
    counts.style.gap = '8px';
    counts.style.flexWrap = 'wrap';
    card.appendChild(counts);

    const btn = $el('button', null, 'Show my players in this game');
    btn.setAttribute('aria-label', `Show your players in ${g.away} at ${g.home}`);
    btn.addEventListener('click', () => selectMatch(g));
    card.appendChild(btn);

    host.appendChild(card);
  }
}

// --- Render Bye Week Section (F1) ---
function renderByeWeek() {
  const container = $('#byeSection');
  if (!container) return;
  container.innerHTML = '';

  if (!state.schedule.length || !state.owned.size) return;

  const teamsPlaying = new Set();
  for (const g of state.schedule) {
    teamsPlaying.add(normalizeTeamTag(g.home));
    teamsPlaying.add(normalizeTeamTag(g.away));
  }

  const byePlayers = [];
  for (const [pid, entry] of state.owned) {
    const team = normalizeTeamTag(entry.player?.team);
    if (team && !teamsPlaying.has(team)) {
      byePlayers.push({
        name: entry.player.full_name || entry.player.last_name || pid,
        team,
        pos: entry.player.position || '-',
        injury: entry.player.injury_status
      });
    }
  }

  if (!byePlayers.length) return;

  const section = $el('div', 'bye-section');
  const title = $el('h3', null, `Players on Bye (${byePlayers.length})`);
  section.appendChild(title);

  const list = $el('div', 'bye-list');
  byePlayers.sort((a, b) => a.pos.localeCompare(b.pos) || a.name.localeCompare(b.name));
  for (const p of byePlayers) {
    const inj = p.injury ? ` ${injuryBadge(p.injury)}` : '';
    const pill = $el('span', 'bye-pill');
    pill.innerHTML = `${p.pos} ${p.name} (${p.team})${inj}`;
    list.appendChild(pill);
  }
  section.appendChild(list);
  container.appendChild(section);
}

// --- Render Watchlist (F8) ---
function renderWatchlist() {
  const container = $('#watchlistSection');
  if (!container) return;
  container.innerHTML = '';

  if (!state.favorites.size || !state.owned.size) return;

  const watchPlayers = [];
  for (const pid of state.favorites) {
    const entry = state.owned.get(pid);
    if (!entry) continue;
    const p = entry.player;
    const team = normalizeTeamTag(p?.team);
    const game = state.schedule.find(g =>
      normalizeTeamTag(g.home) === team || normalizeTeamTag(g.away) === team
    );
    watchPlayers.push({
      name: p.full_name || p.last_name || pid,
      pos: p.position || '-',
      team: team || 'FA',
      injury: p.injury_status,
      matchup: game ? `${game.away} @ ${game.home}` : 'BYE',
      status: game?.status || ''
    });
  }

  if (!watchPlayers.length) return;

  const section = $el('div', 'watchlist-section');
  const title = $el('h3');
  title.innerHTML = `\u2605 Watchlist (${watchPlayers.length})`;
  section.appendChild(title);

  const list = $el('div', 'bye-list');
  for (const p of watchPlayers) {
    const inj = p.injury ? ` ${injuryBadge(p.injury)}` : '';
    const pill = $el('span', 'bye-pill');
    pill.innerHTML = `${p.pos} ${p.name} (${p.team}) \u2014 ${p.matchup}${inj}`;
    list.appendChild(pill);
  }
  section.appendChild(list);
  container.appendChild(section);
}

// --- Select Match & Show Players ---
async function selectMatch(g) {
  state.selectedMatch = g;
  const title = $('#pickedTitle');
  title.textContent = `Selected: ${g.away} @ ${g.home}`;

  const teamSet = new Set([normalizeTeamTag(g.away), normalizeTeamTag(g.home)]);
  const leagueFilter = $('#league').value;
  const season = Number($('#season').value);
  const week = Number($('#week').value);

  const key = await ensureWeekStats();

  // F7: Fetch recent stats for sparklines
  await ensureRecentStats(season, week);

  // --- My players ---
  const rows = [];
  for (const [pid, entry] of state.owned) {
    const p = entry.player;
    const tm = normalizeTeamTag(p?.team);
    if (!teamSet.has(tm)) continue;
    const name = p.full_name || [p.first_name || '', p.last_name || ''].join(' ').trim() || (p.last_name || p.first_name || `#${p.number || ''}`);
    const arr = (leagueFilter === '*') ? entry.leagues : entry.leagues.filter(l => l.id === leagueFilter);
    for (const L of arr) {
      const pts = calcPoints(pid, L.id, key);
      const sparkline = getSparklineData(pid, L.id, season, week);
      rows.push({
        pid,
        name,
        pos: p.position || '-',
        team: tm || 'FA',
        league: L.name,
        pts,
        injury: p.injury_status,
        sparkline,
        isOpponent: false
      });
    }
  }

  // F6: Opponent players
  const oppRows = [];
  if (leagueFilter !== '*') {
    const oppPids = getOpponentPlayers(leagueFilter);
    for (const pid of oppPids) {
      const p = state.playersIndex[pid];
      if (!p) continue;
      const tm = normalizeTeamTag(p.team);
      if (!teamSet.has(tm)) continue;
      // Skip if already in my roster
      if (state.owned.has(pid)) continue;
      const name = p.full_name || [p.first_name || '', p.last_name || ''].join(' ').trim() || `#${p.number || ''}`;
      const pts = calcPoints(pid, leagueFilter, key);
      const sparkline = getSparklineData(pid, leagueFilter, season, week);
      oppRows.push({
        pid,
        name,
        pos: p.position || '-',
        team: tm || 'FA',
        league: 'Opponent',
        pts,
        injury: p.injury_status,
        sparkline,
        isOpponent: true
      });
    }
  } else if (state.leagues.length) {
    // Show opponents across all leagues
    for (const lg of state.leagues) {
      const oppPids = getOpponentPlayers(lg.league_id);
      for (const pid of oppPids) {
        const p = state.playersIndex[pid];
        if (!p) continue;
        const tm = normalizeTeamTag(p.team);
        if (!teamSet.has(tm)) continue;
        if (state.owned.has(pid)) continue;
        // Avoid duplicates
        if (oppRows.some(r => r.pid === pid && r.league === `OPP (${lg.name})`)) continue;
        const name = p.full_name || [p.first_name || '', p.last_name || ''].join(' ').trim() || `#${p.number || ''}`;
        const pts = calcPoints(pid, lg.league_id, key);
        const sparkline = getSparklineData(pid, lg.league_id, season, week);
        oppRows.push({
          pid,
          name,
          pos: p.position || '-',
          team: tm || 'FA',
          league: `OPP (${lg.name})`,
          pts,
          injury: p.injury_status,
          sparkline,
          isOpponent: true
        });
      }
    }
  }

  rows.sort((a, b) => a.league.localeCompare(b.league) || (a.team === b.team ? (a.pos.localeCompare(b.pos) || a.name.localeCompare(b.name)) : a.team.localeCompare(b.team)));
  oppRows.sort((a, b) => a.pos.localeCompare(b.pos) || a.name.localeCompare(b.name));

  const allRows = [...rows, ...oppRows];
  state.lastExportRows = allRows; // F3: save for export

  const isMobile = window.matchMedia('(max-width:900px)').matches;

  if (isMobile) {
    if (!allRows.length) {
      openModal(`${g.away} @ ${g.home}`, $el('div', 'empty', 'You don\'t roster any players in this matchup (for the selected league filter).'));
      return;
    }
    const content = $el('div');
    content.appendChild(buildExportButton(allRows, g));
    content.appendChild(buildList(allRows));
    openModal(`${g.away} @ ${g.home}`, content);
    return;
  }

  const host = $('#players');
  host.innerHTML = '';
  if (!allRows.length) {
    host.appendChild($el('div', 'empty', 'You don\'t roster any players in this matchup (for the selected league filter).'));
    return;
  }
  host.appendChild(buildExportButton(allRows, g));
  host.appendChild(buildList(allRows));
}

// --- Modal ---
function openModal(title, node) {
  $('#modalTitle').textContent = title;
  const b = $('#modalBody');
  b.innerHTML = '';
  b.appendChild(node);
  const modal = $('#modal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  // Focus trap: focus the close button
  $('#modalClose').focus();
}

function closeModal() {
  const modal = $('#modal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

// --- Export Button (F3) ---
function buildExportButton(rows, game) {
  const wrapper = $el('div');
  wrapper.style.display = 'flex';
  wrapper.style.justifyContent = 'flex-end';
  wrapper.style.marginBottom = '8px';

  const btn = $el('button', 'export-btn', 'Copy to Clipboard');
  btn.setAttribute('aria-label', 'Copy player list to clipboard');
  btn.addEventListener('click', () => {
    const header = game ? `${game.away} @ ${game.home}\n${'='.repeat(40)}\n` : '';
    const lines = rows.map(r => {
      const opp = r.isOpponent ? ' (OPP)' : '';
      const inj = r.injury ? ` [${r.injury}]` : '';
      return `${r.pos.padEnd(4)} ${r.name}${opp}${inj}  ${r.team}  ${r.league}  ${r.pts} pts`;
    });
    const text = header + lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    }).catch(() => {
      btn.textContent = 'Failed to copy';
      setTimeout(() => { btn.textContent = 'Copy to Clipboard'; }, 2000);
    });
  });

  wrapper.appendChild(btn);
  return wrapper;
}
