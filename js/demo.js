/* ============================================================
   Demo data — offline sample so the dashboard renders with no
   network. Flows through the exact same build/render path.
   ============================================================ */
function buildDemoData() {
  const now = Date.now();
  const iso = mins => new Date(now + mins * 60000).toISOString();

  // Players index (subset) — pid -> slim info
  const P = {
    p_allen:   { full_name: 'Josh Allen',        team: 'BUF', position: 'QB',  injury_status: null },
    p_mahomes: { full_name: 'Patrick Mahomes',   team: 'KC',  position: 'QB',  injury_status: null },
    p_hurts:   { full_name: 'Jalen Hurts',       team: 'PHI', position: 'QB',  injury_status: null },
    p_lamar:   { full_name: 'Lamar Jackson',     team: 'BAL', position: 'QB',  injury_status: null },
    p_henry:   { full_name: 'Derrick Henry',     team: 'BAL', position: 'RB',  injury_status: null },
    p_cmc:     { full_name: 'Christian McCaffrey',team:'SF',  position: 'RB',  injury_status: 'Questionable' },
    p_bijan:   { full_name: 'Bijan Robinson',    team: 'ATL', position: 'RB',  injury_status: null },
    p_gibbs:   { full_name: 'Jahmyr Gibbs',      team: 'DET', position: 'RB',  injury_status: null },
    p_barkley: { full_name: 'Saquon Barkley',    team: 'PHI', position: 'RB',  injury_status: null },
    p_jacobs:  { full_name: 'Josh Jacobs',       team: 'GB',  position: 'RB',  injury_status: null },
    p_gwilson: { full_name: 'Garrett Wilson',    team: 'NYJ', position: 'WR',  injury_status: null },
    p_chase:   { full_name: "Ja'Marr Chase",     team: 'CIN', position: 'WR',  injury_status: null },
    p_jjeff:   { full_name: 'Justin Jefferson',  team: 'MIN', position: 'WR',  injury_status: null },
    p_lamb:    { full_name: 'CeeDee Lamb',        team: 'DAL', position: 'WR',  injury_status: 'Doubtful' },
    p_stbrown: { full_name: 'Amon-Ra St. Brown', team: 'DET', position: 'WR',  injury_status: null },
    p_nabers:  { full_name: 'Malik Nabers',      team: 'NYG', position: 'WR',  injury_status: null },
    p_london:  { full_name: 'Drake London',      team: 'ATL', position: 'WR',  injury_status: null },
    p_kelce:   { full_name: 'Travis Kelce',      team: 'KC',  position: 'TE',  injury_status: null },
    p_bowers:  { full_name: 'Brock Bowers',      team: 'LV',  position: 'TE',  injury_status: null },
    p_laporta: { full_name: 'Sam LaPorta',       team: 'DET', position: 'TE',  injury_status: null },
    p_mcbride: { full_name: 'Trey McBride',      team: 'ARI', position: 'TE',  injury_status: null },
    p_tucker:  { full_name: 'Justin Tucker',     team: 'BAL', position: 'K',   injury_status: null },
    p_bass:    { full_name: 'Tyler Bass',        team: 'BUF', position: 'K',   injury_status: null },
    SF:        { full_name: 'SF Defense',        team: 'SF',  position: 'DEF', injury_status: null },
    BAL:       { full_name: 'BAL Defense',       team: 'BAL', position: 'DEF', injury_status: null }
  };

  const ROSTER_POS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'];

  // Points per player (simulated live week)
  const pts = {
    p_allen: 28.6, p_mahomes: 19.2, p_hurts: 24.1, p_lamar: 31.4,
    p_henry: 22.5, p_cmc: 4.0, p_bijan: 18.3, p_gibbs: 15.7, p_barkley: 27.9, p_jacobs: 11.2,
    p_gwilson: 14.8, p_chase: 21.6, p_jjeff: 9.4, p_lamb: 0.0, p_stbrown: 17.2, p_nabers: 12.9, p_london: 8.1,
    p_kelce: 11.5, p_bowers: 16.4, p_laporta: 6.7, p_mcbride: 13.0,
    p_tucker: 9.0, p_bass: 7.0, SF: 12.0, BAL: 18.0
  };
  const sp = ids => ids.map(id => pts[id] ?? 0);
  const pmap = ids => Object.fromEntries(ids.map(id => [id, pts[id] ?? 0]));

  const user = { user_id: 'me', display_name: 'You', avatar: null };

  // ---- League A: winning ----
  const aMe   = ['p_allen','p_henry','p_barkley','p_chase','p_stbrown','p_bowers','p_gibbs','p_bass','BAL','p_jacobs','p_london','p_mcbride'];
  const aOpp  = ['p_mahomes','p_gibbs','p_jacobs','p_jjeff','p_nabers','p_kelce','p_london','p_tucker','SF','p_bijan','p_gwilson','p_laporta'];
  // ---- League B: losing, close ----
  const bMe   = ['p_hurts','p_bijan','p_gibbs','p_gwilson','p_nabers','p_laporta','p_jacobs','p_tucker','SF','p_henry','p_london','p_mcbride'];
  const bOpp  = ['p_lamar','p_barkley','p_henry','p_chase','p_stbrown','p_kelce','p_bijan','p_bass','BAL','p_cmc','p_jjeff','p_bowers'];
  // ---- League C: winning big, dynasty ----
  const cMe   = ['p_lamar','p_barkley','p_gibbs','p_jjeff','p_chase','p_mcbride','p_bijan','p_tucker','BAL','p_henry','p_nabers','p_laporta'];
  const cOpp  = ['p_mahomes','p_cmc','p_jacobs','p_london','p_gwilson','p_kelce','p_nabers','p_bass','SF','p_stbrown','p_jjeff','p_bowers'];

  const leagues = [
    { league_id: 'A', name: 'The Gridiron Gauntlet' },
    { league_id: 'B', name: 'Dynasty Warlords' },
    { league_id: 'C', name: 'Office League 2026' }
  ];

  const meta = new Map([
    ['A', { name: leagues[0].name, avatar: null, roster_positions: ROSTER_POS, scoring_settings: {} }],
    ['B', { name: leagues[1].name, avatar: null, roster_positions: ROSTER_POS, scoring_settings: {} }],
    ['C', { name: leagues[2].name, avatar: null, roster_positions: ROSTER_POS, scoring_settings: {} }]
  ]);

  const rostersByLeague = new Map([
    ['A', [
      { roster_id: 1, owner_id: 'me',  players: aMe,  starters: aMe.slice(0, 9),  settings: { wins: 6, losses: 2, ties: 0 } },
      { roster_id: 2, owner_id: 'rivA', players: aOpp, starters: aOpp.slice(0, 9), settings: { wins: 4, losses: 4, ties: 0 } }
    ]],
    ['B', [
      { roster_id: 1, owner_id: 'me',  players: bMe,  starters: bMe.slice(0, 9),  settings: { wins: 3, losses: 5, ties: 0 } },
      { roster_id: 2, owner_id: 'rivB', players: bOpp, starters: bOpp.slice(0, 9), settings: { wins: 7, losses: 1, ties: 0 } }
    ]],
    ['C', [
      { roster_id: 1, owner_id: 'me',  players: cMe,  starters: cMe.slice(0, 9),  settings: { wins: 8, losses: 0, ties: 0 } },
      { roster_id: 2, owner_id: 'rivC', players: cOpp, starters: cOpp.slice(0, 9), settings: { wins: 5, losses: 3, ties: 0 } }
    ]]
  ]);

  const usersByLeague = new Map([
    ['A', new Map([['me', user], ['rivA', { user_id: 'rivA', display_name: 'Sunday Scaries', metadata: { team_name: 'Sunday Scaries' } }]])],
    ['B', new Map([['me', user], ['rivB', { user_id: 'rivB', display_name: 'Waiver Wire Kings', metadata: { team_name: 'Waiver Wire Kings' } }]])],
    ['C', new Map([['me', user], ['rivC', { user_id: 'rivC', display_name: 'Marc from Accounting', metadata: { team_name: 'Marc from Accounting' } }]])]
  ]);

  const mk = (ids) => ({ starters: ids.slice(0, 9), starters_points: sp(ids.slice(0, 9)), players: ids, players_points: pmap(ids) });
  const withTotal = (obj) => ({ ...obj, points: obj.starters_points.reduce((a, b) => a + b, 0) });

  const matchupsByLeague = new Map([
    ['A', [
      { roster_id: 1, matchup_id: 1, ...withTotal(mk(aMe)) },
      { roster_id: 2, matchup_id: 1, ...withTotal(mk(aOpp)) }
    ]],
    ['B', [
      { roster_id: 1, matchup_id: 1, ...withTotal(mk(bMe)) },
      { roster_id: 2, matchup_id: 1, ...withTotal(mk(bOpp)) }
    ]],
    ['C', [
      { roster_id: 1, matchup_id: 1, ...withTotal(mk(cMe)) },
      { roster_id: 2, matchup_id: 1, ...withTotal(mk(cOpp)) }
    ]]
  ]);

  // Schedule: mix of final / live / upcoming; DAL absent => bye
  const schedule = [
    { id: 'g1', home: 'BUF', away: 'KC',  kickoff: iso(-200), home_score: 27, away_score: 24, status: 'Final', live: false },
    { id: 'g2', home: 'BAL', away: 'CIN', kickoff: iso(-30),  home_score: 21, away_score: 17, status: 'Q3 4:12', live: true },
    { id: 'g3', home: 'DET', away: 'MIN', kickoff: iso(-30),  home_score: 14, away_score: 10, status: 'Q2 1:40', live: true },
    { id: 'g4', home: 'PHI', away: 'NYG', kickoff: iso(90),   home_score: null, away_score: null, status: 'pre', live: false },
    { id: 'g5', home: 'SF',  away: 'ATL', kickoff: iso(90),   home_score: null, away_score: null, status: 'pre', live: false },
    { id: 'g6', home: 'GB',  away: 'ARI', kickoff: iso(180),  home_score: null, away_score: null, status: 'pre', live: false },
    { id: 'g7', home: 'LV',  away: 'NYJ', kickoff: iso(180),  home_score: null, away_score: null, status: 'pre', live: false }
  ].map(g => ({ ...g, home: normalizeTeamTag(g.home), away: normalizeTeamTag(g.away) }));

  return {
    user, season: 2026, week: 9, leagues, leagueMeta: meta,
    rostersByLeague, usersByLeague, matchupsByLeague,
    playersIndex: P, schedule
  };
}
