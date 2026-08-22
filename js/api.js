/* ============================================================
   API Layer — Sleeper + ESPN, plus dashboard model builder
   ============================================================ */

async function jsonFetch(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      if (attempt < retries) { await sleep(1500); continue; }
      throw new Error(`Failed to fetch ${url}: ${e.message}`);
    }
  }
}

// --- Sleeper API ---
const sleeper = {
  getState:    () => jsonFetch('https://api.sleeper.app/v1/state/nfl'),
  getUser:     u  => jsonFetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(u)}`),
  getLeagues:  (uid, season) => jsonFetch(`https://api.sleeper.app/v1/user/${uid}/leagues/nfl/${season}`),
  getLeague:   id => jsonFetch(`https://api.sleeper.app/v1/league/${id}`),
  getRosters:  id => jsonFetch(`https://api.sleeper.app/v1/league/${id}/rosters`),
  getLeagueUsers: id => jsonFetch(`https://api.sleeper.app/v1/league/${id}/users`),
  getPlayers:  () => jsonFetch('https://api.sleeper.app/v1/players/nfl'),
  getMatchups: (id, week) => jsonFetch(`https://api.sleeper.app/v1/league/${id}/matchups/${week}`)
};

// --- ESPN schedule (for per-player NFL game status) ---
const scheduleProvider = {
  async espn(year, week) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?year=${year}&week=${week}&seasontype=2`;
    const data = await jsonFetch(url);
    const events = data?.events || [];
    return events.map(ev => {
      const c = ev.competitions?.[0];
      const h = c?.competitors?.find(x => x.homeAway === 'home');
      const a = c?.competitors?.find(x => x.homeAway === 'away');
      const toSym = t => t?.team?.abbreviation || t?.team?.displayName || 'TBD';
      const status = c?.status, type = status?.type;
      let st = '', live = false;
      if (type?.completed) st = 'Final';
      else if (type?.state === 'pre') st = 'pre';
      else if (type?.state === 'in') { st = status?.period ? `Q${status.period} ${status.displayClock || ''}`.trim() : 'Live'; live = true; }
      else st = type?.description || '';
      return {
        id: ev.id, week,
        kickoff: c?.date || ev?.date,
        home: normalizeTeamTag(toSym(h)),
        away: normalizeTeamTag(toSym(a)),
        home_score: h?.score != null ? Number(h.score) : null,
        away_score: a?.score != null ? Number(a.score) : null,
        status: st, live
      };
    });
  }
};

// --- Build team -> game index and human-friendly status ---
function indexSchedule() {
  state.scheduleByTeam = new Map();
  for (const g of state.schedule) {
    if (g.home) state.scheduleByTeam.set(g.home, g);
    if (g.away) state.scheduleByTeam.set(g.away, g);
  }
}

function gameStatusFor(team) {
  const t = normalizeTeamTag(team);
  if (!t) return { text: '', kind: 'none' };
  const g = state.scheduleByTeam.get(t);
  if (!g) return { text: 'BYE', kind: 'bye' };
  const opp = g.home === t ? g.away : g.home;
  const homeAway = g.home === t ? 'vs' : '@';
  if (g.status === 'Final') return { text: `Final ${homeAway} ${opp}`, kind: 'final' };
  if (g.live) return { text: g.status, kind: 'live' };
  // pre / scheduled
  const ko = g.kickoff ? new Date(g.kickoff) : null;
  const when = ko ? ko.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'TBA';
  return { text: `${homeAway} ${opp} · ${when}`, kind: 'pre' };
}

// --- Slim player index builder ---
function buildSlimPlayerIndex(raw) {
  const slim = {};
  for (const [k, v] of Object.entries(raw)) {
    slim[k] = {
      full_name: v.full_name || [v.first_name, v.last_name].filter(Boolean).join(' '),
      team: v.team,
      position: v.position,
      injury_status: v.injury_status || null
    };
  }
  return slim;
}

// Sleeper uses team defenses keyed by team abbreviation (e.g. "SF")
function playerInfo(pid) {
  const p = state.playersIndex[pid];
  if (p) return p;
  // DEF ids are team abbreviations
  if (typeof pid === 'string' && pid.length <= 3 && pid === pid.toUpperCase()) {
    return { full_name: `${pid} Defense`, team: pid, position: 'DEF', injury_status: null };
  }
  return { full_name: pid, team: null, position: '-', injury_status: null };
}

// --- Resolve a display name for a fantasy team ---
function teamName(user, roster) {
  if (user?.metadata?.team_name) return user.metadata.team_name;
  if (user?.display_name) return user.display_name;
  if (roster?.metadata?.team_name) return roster.metadata.team_name;
  return 'Team ' + (roster?.roster_id ?? '?');
}

// --- Starting slot labels for a league (exclude bench/IR/taxi) ---
function startingSlots(leagueId) {
  const meta = state.leagueMeta.get(leagueId) || {};
  const positions = Array.isArray(meta.roster_positions) ? meta.roster_positions : [];
  return positions.filter(p => !['BN', 'IR', 'TAXI'].includes(p));
}

/* ------------------------------------------------------------
   Build the dashboard: one card per league = my team vs opp
   ------------------------------------------------------------ */
function buildDashboard() {
  const myId = state.user?.user_id;
  const cards = [];

  for (const lg of state.leagues) {
    const id = lg.league_id;
    const rosters = state.rostersByLeague.get(id) || [];
    const users = state.usersByLeague.get(id) || new Map();
    const matchups = state.matchupsByLeague.get(id) || [];

    // Find my roster
    const myRoster = rosters.find(r => {
      const co = Array.isArray(r.co_owners) ? r.co_owners : [];
      return r.owner_id === myId || co.includes(myId);
    });
    if (!myRoster) continue;

    const rec = myRoster.settings || {};
    const record = { w: rec.wins || 0, l: rec.losses || 0, t: rec.ties || 0 };

    const myEntry = matchups.find(m => m.roster_id === myRoster.roster_id);
    let oppEntry = null, oppRoster = null;
    if (myEntry && myEntry.matchup_id != null) {
      oppEntry = matchups.find(m => m.matchup_id === myEntry.matchup_id && m.roster_id !== myRoster.roster_id);
      if (oppEntry) oppRoster = rosters.find(r => r.roster_id === oppEntry.roster_id);
    }

    const slots = startingSlots(id);

    const side = (roster, entry) => {
      if (!roster) return null;
      const u = users.get(roster.owner_id);
      const starters = Array.isArray(entry?.starters) ? entry.starters : (roster.starters || []);
      const sPts = Array.isArray(entry?.starters_points) ? entry.starters_points : [];
      const pMap = entry?.players_points || {};
      const lineup = starters.map((pid, i) => {
        const info = playerInfo(pid);
        const pts = sPts[i] != null ? sPts[i] : (pMap[pid] != null ? pMap[pid] : 0);
        const isEmpty = !pid || pid === '0';
        return {
          slot: slotLabel(slots[i] || info.position || '-'),
          pid: isEmpty ? null : pid,
          name: isEmpty ? '—' : info.full_name,
          pos: info.position || '-',
          team: normalizeTeamTag(info.team),
          injury: info.injury_status,
          pts: Number(pts) || 0,
          game: isEmpty ? { text: '', kind: 'none' } : gameStatusFor(info.team),
          empty: isEmpty
        };
      });
      const total = entry?.points != null ? Number(entry.points)
        : lineup.reduce((s, p) => s + p.pts, 0);
      const yetToPlay = lineup.filter(p => !p.empty && (p.game.kind === 'pre')).length;
      return {
        name: teamName(u, roster),
        avatar: avatarUrl(u?.avatar || u?.metadata?.avatar),
        total,
        lineup,
        yetToPlay,
        rosterId: roster.roster_id
      };
    };

    const me = side(myRoster, myEntry);
    const opp = side(oppRoster, oppEntry);

    let result = 'none';
    if (opp) {
      if (me.total > opp.total) result = 'winning';
      else if (me.total < opp.total) result = 'losing';
      else result = 'tie';
    }

    cards.push({
      leagueId: id,
      leagueName: lg.name || id,
      leagueAvatar: avatarUrl(state.leagueMeta.get(id)?.avatar, 'thumbs'),
      record,
      hasMatchup: !!(myEntry && oppEntry),
      me, opp, slots, result
    });
  }

  // Sort: matchups first, then winning/tie/losing, then league name
  const order = { winning: 0, tie: 1, losing: 2, none: 3 };
  cards.sort((a, b) => {
    if (a.hasMatchup !== b.hasMatchup) return a.hasMatchup ? -1 : 1;
    if (order[a.result] !== order[b.result]) return order[a.result] - order[b.result];
    return a.leagueName.localeCompare(b.leagueName);
  });

  state.cards = cards;
  return cards;
}
