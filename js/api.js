/* ============================================================
   API Layer — Sleeper + ESPN with retry & error handling
   ============================================================ */

// --- Fetch with Retry (O6) ---
async function jsonFetch(url, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      if (attempt < retries) {
        await sleep(2000);
        continue;
      }
      throw new Error(`Failed to fetch ${url}: ${e.message}`);
    }
  }
}

// --- Sleeper API ---
const sleeper = {
  async getState() {
    return jsonFetch('https://api.sleeper.app/v1/state/nfl');
  },
  async getUser(username) {
    return jsonFetch(`https://api.sleeper.app/v1/user/${encodeURIComponent(username)}`);
  },
  async getLeagues(userId, season) {
    return jsonFetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${season}`);
  },
  async getLeague(leagueId) {
    return jsonFetch(`https://api.sleeper.app/v1/league/${leagueId}`);
  },
  async getRosters(leagueId) {
    return jsonFetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
  },
  async getPlayers() {
    return jsonFetch('https://api.sleeper.app/v1/players/nfl');
  },
  async getWeekStats(season, week) {
    return jsonFetch(`https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`);
  },
  // F6: Opponent Roster — league matchups for a week
  async getMatchups(leagueId, week) {
    return jsonFetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
  }
};

// --- ESPN Schedule Provider ---
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
      const status = c?.status;
      const type = status?.type;
      let st = '';
      if (type?.completed) st = 'Final';
      else if (type?.state === 'pre') st = 'Scheduled';
      else if (type?.state === 'in') st = status?.period ? `Q${status.period} ${status.displayClock || ''}`.trim() : 'Live';
      else st = type?.description || '';
      return {
        id: ev.id,
        week,
        kickoff: c?.date || ev?.date,
        home: toSym(h),
        away: toSym(a),
        home_score: h?.score != null ? Number(h.score) : null,
        away_score: a?.score != null ? Number(a.score) : null,
        status: st
      };
    });
  },
  async inline(year, week) {
    return INLINE_TEST_SCHEDULE.filter(g => g.year === year && g.week === week).map(g => ({ ...g }));
  }
};

// --- Slim Player Index Builder ---
function buildSlimPlayerIndex(rawIndex) {
  const slim = {};
  for (const [k, v] of Object.entries(rawIndex)) {
    slim[k] = {
      full_name: v.full_name,
      first_name: v.first_name,
      last_name: v.last_name,
      team: v.team,
      position: v.position,
      number: v.number,
      injury_status: v.injury_status || null  // F2: preserve injury data
    };
  }
  return slim;
}

// --- Owned Index Builder ---
function buildOwnedIndex() {
  const myId = state.user?.user_id;
  state.owned = new Map();
  if (state.demoMode) {
    for (const p of DEMO_ROSTER) {
      state.owned.set(p.pid, { player: p, leagues: [{ id: 'demo', name: 'DEMO League' }] });
    }
    return;
  }
  for (const [leagueId, rosters] of state.rostersByLeague) {
    const league = state.leagues.find(l => l.league_id === leagueId);
    for (const r of rosters) {
      const co = Array.isArray(r.co_owners) ? r.co_owners : [];
      const isMine = r.owner_id === myId || co.includes(myId);
      if (!isMine) continue;
      const ids = Array.isArray(r.players) ? r.players : [];
      for (const pid of ids) {
        const p = state.playersIndex[pid];
        if (!p) continue;
        const entry = state.owned.get(pid) || { player: p, leagues: [] };
        if (!entry.leagues.some(x => x.id === leagueId)) {
          entry.leagues.push({ id: leagueId, name: league?.name || leagueId });
        }
        state.owned.set(pid, entry);
      }
    }
  }
}

// --- Week Stats Cache ---
async function ensureWeekStats() {
  const season = Number($('#season').value);
  const week = Number($('#week').value);
  const key = `${season}-${week}`;
  if (!state.statsCache.has(key)) {
    const stats = await sleeper.getWeekStats(season, week);
    state.statsCache.set(key, stats || {});
  }
  return key;
}

// --- Points Calculation ---
function calcPoints(pid, leagueId, key) {
  const stats = state.statsCache.get(key) || {};
  const s = stats?.[pid] || {};
  const settings = state.leagueSettings.get(leagueId) || {};
  let total = 0;
  for (const k in settings) {
    const w = settings[k];
    const v = s[k];
    if (typeof w === 'number' && typeof v === 'number') total += w * v;
  }
  return (Math.round(total * 100) / 100).toFixed(2);
}

// --- Fetch Recent Week Stats for Sparklines (F7) ---
async function ensureRecentStats(season, currentWeek, lookback = 4) {
  const startWeek = Math.max(1, currentWeek - lookback);
  const promises = [];
  for (let w = startWeek; w < currentWeek; w++) {
    const key = `${season}-${w}`;
    if (!state.statsCache.has(key)) {
      promises.push(
        sleeper.getWeekStats(season, w)
          .then(stats => state.statsCache.set(key, stats || {}))
          .catch(() => state.statsCache.set(key, {}))
      );
    }
  }
  if (promises.length) await Promise.all(promises);
}

// --- Get Sparkline Data for a Player (F7) ---
function getSparklineData(pid, leagueId, season, currentWeek, lookback = 4) {
  const startWeek = Math.max(1, currentWeek - lookback);
  const points = [];
  for (let w = startWeek; w < currentWeek; w++) {
    const key = `${season}-${w}`;
    points.push(Number(calcPoints(pid, leagueId, key)));
  }
  return points;
}

// --- Fetch Opponent Matchups (F6) ---
async function fetchLeagueMatchups(week) {
  state.matchups = new Map();
  const results = await batchFetch(state.leagues, async (lg) => {
    const matchups = await sleeper.getMatchups(lg.league_id, week);
    return { leagueId: lg.league_id, matchups };
  }, 3);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      state.matchups.set(result.value.leagueId, result.value.matchups);
    }
  }
}

// --- Get Opponent Players for a League (F6) ---
function getOpponentPlayers(leagueId) {
  const matchups = state.matchups.get(leagueId);
  if (!matchups) return [];

  const myId = state.user?.user_id;
  const rosters = state.rostersByLeague.get(leagueId) || [];

  // Find my roster_id
  const myRoster = rosters.find(r => {
    const co = Array.isArray(r.co_owners) ? r.co_owners : [];
    return r.owner_id === myId || co.includes(myId);
  });
  if (!myRoster) return [];

  // Find my matchup entry
  const myMatchup = matchups.find(m => m.roster_id === myRoster.roster_id);
  if (!myMatchup || myMatchup.matchup_id == null) return [];

  // Find opponent's matchup entry
  const oppMatchup = matchups.find(m =>
    m.matchup_id === myMatchup.matchup_id && m.roster_id !== myRoster.roster_id
  );
  if (!oppMatchup) return [];

  return Array.isArray(oppMatchup.players) ? oppMatchup.players : [];
}
