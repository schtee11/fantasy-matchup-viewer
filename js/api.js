/* ============================================================
   API Layer — Sleeper + ESPN, plus model builders
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

// --- ESPN scoreboard (rich game data) ---
const scheduleProvider = {
  async espn(year, week) {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?year=${year}&week=${week}&seasontype=2`;
    const data = await jsonFetch(url);
    const events = data?.events || [];
    return events.map(ev => {
      const c = ev.competitions?.[0];
      const comps = c?.competitors || [];
      const h = comps.find(x => x.homeAway === 'home');
      const a = comps.find(x => x.homeAway === 'away');
      const toSym = t => normalizeTeamTag(t?.team?.abbreviation || t?.team?.displayName || 'TBD');
      const status = c?.status, type = status?.type;
      let st = '', live = false;
      if (type?.completed) st = 'Final';
      else if (type?.state === 'pre') st = 'pre';
      else if (type?.state === 'in') { st = status?.period ? `Q${status.period} ${status.displayClock || ''}`.trim() : 'Live'; live = true; }
      else st = type?.description || '';

      // possession / situation
      const sit = c?.situation || {};
      let possTeam = null;
      if (sit.possession) {
        const owner = comps.find(x => x.id === sit.possession || x.team?.id === sit.possession);
        possTeam = owner ? toSym(owner) : null;
      }
      const rec = t => t?.records?.find(r => r.type === 'total')?.summary || t?.records?.[0]?.summary || '';

      return {
        id: ev.id, week,
        kickoff: c?.date || ev?.date,
        home: toSym(h), away: toSym(a),
        home_score: h?.score != null ? Number(h.score) : null,
        away_score: a?.score != null ? Number(a.score) : null,
        home_rec: rec(h), away_rec: rec(a),
        status: st, live,
        period: status?.period || null,
        clock: status?.displayClock || '',
        possession: possTeam,
        redzone: !!sit.isRedZone,
        downDistance: sit.downDistanceText || '',
        lastPlay: sit.lastPlay?.text || '',
        broadcast: c?.broadcasts?.[0]?.names?.[0] || (c?.geoBroadcasts?.[0]?.media?.shortName) || ''
      };
    });
  }
};

function indexSchedule() {
  state.scheduleByTeam = new Map();
  for (const g of state.schedule) {
    if (g.home) state.scheduleByTeam.set(g.home, g);
    if (g.away) state.scheduleByTeam.set(g.away, g);
  }
}

// Human status for a player's NFL team
function gameStatusFor(team) {
  const t = normalizeTeamTag(team);
  if (!t) return { text: '', kind: 'none' };
  const g = state.scheduleByTeam.get(t);
  if (!g) return { text: 'BYE', kind: 'bye' };
  const opp = g.home === t ? g.away : g.home;
  const ha = g.home === t ? 'vs' : '@';
  if (g.status === 'Final') return { text: `Final ${ha} ${opp}`, kind: 'final', gameId: g.id };
  if (g.live) return { text: `${g.status} ${ha} ${opp}`.trim(), kind: 'live', gameId: g.id };
  const ko = g.kickoff ? new Date(g.kickoff) : null;
  const when = ko ? ko.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'TBA';
  return { text: `${ha} ${opp} · ${when}`, kind: 'pre', gameId: g.id };
}

// --- Slim player index ---
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
function playerInfo(pid) {
  const p = state.playersIndex[pid];
  if (p) return p;
  if (typeof pid === 'string' && pid.length <= 3 && pid === pid.toUpperCase()) {
    return { full_name: `${pid} Defense`, team: pid, position: 'DEF', injury_status: null };
  }
  return { full_name: pid, team: null, position: '-', injury_status: null };
}

function teamName(user, roster) {
  if (user?.metadata?.team_name) return user.metadata.team_name;
  if (user?.display_name) return user.display_name;
  if (roster?.metadata?.team_name) return roster.metadata.team_name;
  return 'Team ' + (roster?.roster_id ?? '?');
}

function startingSlots(leagueId) {
  const meta = state.leagueMeta.get(leagueId) || {};
  const positions = Array.isArray(meta.roster_positions) ? meta.roster_positions : [];
  return positions.filter(p => !['BN', 'IR', 'TAXI'].includes(p));
}

/* ------------------------------------------------------------
   Per-league matchup cards (Matchups view)
   ------------------------------------------------------------ */
function buildDashboard() {
  const myId = state.user?.user_id;
  const cards = [];

  for (const lg of state.leagues) {
    const id = lg.league_id;
    const rosters = state.rostersByLeague.get(id) || [];
    const users = state.usersByLeague.get(id) || new Map();
    const matchups = state.matchupsByLeague.get(id) || [];

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
      const total = entry?.points != null ? Number(entry.points) : lineup.reduce((s, p) => s + p.pts, 0);
      const yetToPlay = lineup.filter(p => !p.empty && p.game.kind === 'pre').length;
      return { name: teamName(u, roster), avatar: avatarUrl(u?.avatar || u?.metadata?.avatar), total, lineup, yetToPlay, rosterId: roster.roster_id };
    };

    const me = side(myRoster, myEntry);
    const opp = side(oppRoster, oppEntry);
    let result = 'none';
    if (opp) result = me.total > opp.total ? 'winning' : me.total < opp.total ? 'losing' : 'tie';

    cards.push({
      leagueId: id,
      leagueName: lg.name || id,
      leagueAvatar: avatarUrl(state.leagueMeta.get(id)?.avatar, 'thumbs'),
      record, hasMatchup: !!(myEntry && oppEntry), me, opp, slots, result
    });
  }

  const order = { winning: 0, tie: 1, losing: 2, none: 3 };
  cards.sort((a, b) => {
    if (a.hasMatchup !== b.hasMatchup) return a.hasMatchup ? -1 : 1;
    if (order[a.result] !== order[b.result]) return order[a.result] - order[b.result];
    return a.leagueName.localeCompare(b.leagueName);
  });
  state.cards = cards;
  return cards;
}

/* ------------------------------------------------------------
   Unified command-center model (Games / Players / Insights)
   ------------------------------------------------------------ */
function buildModel() {
  const cards = state.cards || [];
  const players = new Map();   // my starters, aggregated across leagues
  const villains = new Map();  // opponents' starters, aggregated

  const add = (map, p, leagueInfo) => {
    let e = map.get(p.pid);
    if (!e) {
      e = { pid: p.pid, name: p.name, pos: p.pos, team: normalizeTeamTag(p.team), injury: p.injury, game: p.game, leagues: [] };
      map.set(p.pid, e);
    }
    e.leagues.push(leagueInfo);
    return e;
  };

  for (const card of cards) {
    if (card.me) for (const p of card.me.lineup) {
      if (p.empty || !p.pid) continue;
      add(players, p, { id: card.leagueId, name: card.leagueName, avatar: card.leagueAvatar, slot: p.slot, pts: p.pts, result: card.result, myTotal: card.me.total, oppTotal: card.opp?.total ?? null });
    }
    if (card.opp) for (const p of card.opp.lineup) {
      if (p.empty || !p.pid) continue;
      add(villains, p, { id: card.leagueId, name: card.leagueName, slot: p.slot, pts: p.pts, result: card.result });
    }
  }

  const finalize = map => [...map.values()].map(e => {
    e.totalPts = e.leagues.reduce((s, l) => s + l.pts, 0);
    e.exposure = e.leagues.length;
    e.maxPts = Math.max(...e.leagues.map(l => l.pts), 0);
    return e;
  });
  const playerList = finalize(players);
  const villainList = finalize(villains);

  // Flash detection (only after first model has been built)
  const bumped = new Set();
  for (const p of playerList) for (const l of p.leagues) {
    const key = p.pid + '@' + l.id;
    const prev = state.prevPts.get(key);
    if (state.firstModelBuilt && prev != null && l.pts > prev + 0.001) bumped.add(key);
    state.prevPts.set(key, l.pts);
  }
  state.bumped = bumped;
  state.firstModelBuilt = true;

  // Games annotated with my players
  const games = state.schedule.map(g => {
    const teams = new Set([g.home, g.away]);
    const mine = playerList.filter(p => teams.has(p.team)).sort((a, b) => b.totalPts - a.totalPts);
    const villainsIn = villainList.filter(p => teams.has(p.team));
    return { ...g, mine, mineCount: mine.length, minePts: mine.reduce((s, p) => s + p.totalPts, 0), villainsIn };
  });
  const gameOrder = g => g.live ? 0 : g.status === 'pre' ? 1 : g.status === 'Final' ? 2 : 3;
  games.sort((a, b) => gameOrder(a) - gameOrder(b)
    || (new Date(a.kickoff || 0) - new Date(b.kickoff || 0)));

  // Aggregates
  const kindCount = k => playerList.filter(p => p.game.kind === k).length;
  const agg = {
    leagues: cards.length,
    winning: cards.filter(c => c.hasMatchup && c.result === 'winning').length,
    losing: cards.filter(c => c.hasMatchup && c.result === 'losing').length,
    tie: cards.filter(c => c.hasMatchup && c.result === 'tie').length,
    starters: playerList.length,
    playing: kindCount('live'),
    upcoming: kindCount('pre'),
    done: kindCount('final'),
    bye: kindCount('bye'),
    livePts: playerList.filter(p => p.game.kind === 'live').reduce((s, p) => s + p.totalPts, 0),
    liveGames: games.filter(g => g.live).length,
    record: cards.reduce((a, c) => ({ w: a.w + c.record.w, l: a.l + c.record.l, t: a.t + c.record.t }), { w: 0, l: 0, t: 0 })
  };

  state.model = { players, playerList, villainList, games, cards, agg };
  return state.model;
}
