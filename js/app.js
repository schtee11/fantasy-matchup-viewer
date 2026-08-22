/* ============================================================
   App — shell, view routing, live engine, events, demo mode
   ============================================================ */

const VIEWS = [
  { id: 'matchups', label: 'Matchups', icon: '🆚' },
  { id: 'games', label: 'Games', icon: '🏟' },
  { id: 'players', label: 'Players', icon: '👥' },
  { id: 'insights', label: 'Insights', icon: '📈' }
];

// --- Render the active view (preserving scroll) ---
function renderActive() {
  const host = $('#view');
  if (!host) return;
  const y = window.scrollY;
  host.innerHTML = '';
  try {
    if (state.view === 'games') renderGames(host);
    else if (state.view === 'players') renderPlayers(host);
    else if (state.view === 'insights') renderInsights(host);
    else renderMatchups(host);
  } catch (e) {
    host.appendChild(emptyEl('Something went wrong rendering this view: ' + e.message));
    console.error(e);
  }
  window.scrollTo(0, y);
  updateNav();
  updateLiveBar();
}

function switchView(id) {
  state.view = id;
  if (id !== 'players') state.jumpTeams = null;
  lsSet(VIEW_KEY, id);
  writeUrlState();
  renderActive();
}

function updateNav() {
  $$('#viewnav .navbtn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
}

function buildNav() {
  const nav = $('#viewnav');
  nav.innerHTML = '';
  for (const v of VIEWS) {
    const b = $el('button', 'navbtn' + (v.id === state.view ? ' active' : ''));
    b.dataset.view = v.id;
    b.innerHTML = `<span class="nav-ic">${v.icon}</span>${v.label}`;
    b.addEventListener('click', () => switchView(v.id));
    nav.appendChild(b);
  }
}

// --- Live status bar ---
function updateLiveBar() {
  const bar = $('#livebar');
  if (!bar) return;
  const hasData = !!state.model;
  bar.style.display = hasData ? '' : 'none';
  if (!hasData) return;
  const live = state.model.agg.liveGames;
  const dot = live ? '<span class="live-dot"></span>' : '';
  const liveTxt = live ? `<span class="lb-live">${live} live</span>` : '<span class="lb-idle">No live games</span>';
  const updated = state.lastUpdated ? `Updated ${timeAgo(state.lastUpdated)}` : '';
  const src = state.demoMode ? '<span class="lb-demo">DEMO</span>' : '';
  $('#lbStatus').innerHTML = `${dot}${liveTxt} · <span class="lb-upd">${updated}</span> ${src}`;
}
function startClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    const el = $('#lbStatus .lb-upd');
    if (el && state.lastUpdated) el.textContent = `Updated ${timeAgo(state.lastUpdated)}`;
  }, 1000);
}

// --- Live refresh (scores + matchups only) ---
async function refreshScores() {
  if (state.demoMode) return;
  try {
    try { state.schedule = await scheduleProvider.espn(state.season, state.week); indexSchedule(); } catch { /* keep */ }
    await batchFetch(state.leagues, async lg => {
      try { const mm = await sleeper.getMatchups(lg.league_id, state.week); state.matchupsByLeague.set(lg.league_id, mm || []); } catch { /* skip */ }
    });
    buildDashboard();
    buildModel();
    state.lastUpdated = Date.now();
    renderActive();
  } catch { /* silent */ }
}

function scheduleLive() {
  if (autoTimer) clearInterval(autoTimer);
  if (state.demoMode) return;
  const now = Date.now();
  const hasLive = state.schedule.some(g => g.live);
  const soon = state.schedule.some(g => g.status === 'pre' && g.kickoff && (new Date(g.kickoff).getTime() - now) < 6 * 3600e3);
  const allFinal = state.schedule.length > 0 && state.schedule.every(g => g.status === 'Final');
  if (allFinal && !soon) return;
  const iv = hasLive ? 15000 : soon ? 30000 : 60000;
  autoTimer = setInterval(async () => {
    if (document.hidden) return;
    await refreshScores();
    scheduleLive();
  }, iv);
}

// --- Main load ---
async function load() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  const username = ($('#username').value || '').trim();
  $('#loadBtn').disabled = true;
  $('#loadBtn').textContent = 'Loading…';
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }

  try {
    if (!username) throw new Error('Enter your Sleeper username first.');
    setStoredUsername(username);
    state.demoMode = false;
    state.season = Number($('#season').value) || new Date().getFullYear();
    state.week = Number($('#week').value) || 1;

    setStatus('<span class="loading">Looking up user…</span>');
    const user = await sleeper.getUser(username);
    if (!user || !user.user_id) throw new Error(`User "${username}" not found on Sleeper.`);
    state.user = user;

    setStatus('<span class="loading">Loading your leagues…</span>');
    const leaguesRaw = await sleeper.getLeagues(user.user_id, state.season);
    state.leagues = (leaguesRaw || []).map(l => ({ league_id: l.league_id, name: l.name }));
    state.leagueMeta = new Map();
    for (const l of (leaguesRaw || [])) {
      state.leagueMeta.set(l.league_id, {
        name: l.name, avatar: l.avatar,
        roster_positions: l.roster_positions || [],
        scoring_settings: l.scoring_settings || {}
      });
    }

    if (!state.leagues.length) {
      state.cards = []; state.model = null; renderActive();
      setStatus(`No leagues found for <strong>${esc(username)}</strong> in ${state.season}. Try a different season.`, 'warn');
      return;
    }

    if (!Object.keys(state.playersIndex).length) {
      const cached = getCachedPlayers();
      if (cached) state.playersIndex = cached;
      else {
        setStatus('<span class="loading">Fetching NFL player database (first load is slow)…</span>');
        const idx = await sleeper.getPlayers();
        state.playersIndex = buildSlimPlayerIndex(idx);
        setCachedPlayers(state.playersIndex);
      }
    }

    setStatus(`<span class="loading">Loading ${state.leagues.length} leagues…</span>`);
    state.rostersByLeague = new Map();
    state.usersByLeague = new Map();
    state.matchupsByLeague = new Map();
    await batchFetch(state.leagues, async lg => {
      const id = lg.league_id;
      const [rosters, users, matchups] = await Promise.all([
        sleeper.getRosters(id).catch(() => []),
        sleeper.getLeagueUsers(id).catch(() => []),
        sleeper.getMatchups(id, state.week).catch(() => [])
      ]);
      state.rostersByLeague.set(id, rosters || []);
      const umap = new Map();
      for (const u of (users || [])) umap.set(u.user_id, u);
      state.usersByLeague.set(id, umap);
      state.matchupsByLeague.set(id, matchups || []);
    }, 4);

    setStatus('<span class="loading">Fetching NFL schedule…</span>');
    try { state.schedule = await scheduleProvider.espn(state.season, state.week); } catch { state.schedule = []; }
    indexSchedule();

    state.prevPts = new Map();
    state.firstModelBuilt = false;
    buildDashboard();
    buildModel();
    state.lastUpdated = Date.now();
    renderActive();
    writeUrlState();

    const a = state.model.agg;
    setStatus(`Loaded <strong>${a.leagues}</strong> team(s) for <strong>${esc(username)}</strong> · Week ${state.week}, ${state.season}`
      + (a.winning + a.losing ? ` · ${a.winning} winning, ${a.losing} losing` : ''), 'ok');
    scheduleLive();
  } catch (err) {
    setStatus('Error: ' + esc(err.message), 'err');
  } finally {
    $('#loadBtn').disabled = false;
    $('#loadBtn').textContent = 'Load';
    refreshInProgress = false;
  }
}

// --- Demo mode (offline, with simulated live ticks) ---
function loadDemo() {
  state.demoMode = true;
  if (autoTimer) clearInterval(autoTimer);
  const D = buildDemoData();
  state.user = D.user; state.season = D.season; state.week = D.week;
  state.leagues = D.leagues; state.leagueMeta = D.leagueMeta;
  state.rostersByLeague = D.rostersByLeague;
  state.usersByLeague = D.usersByLeague;
  state.matchupsByLeague = D.matchupsByLeague;
  state.playersIndex = D.playersIndex; state.schedule = D.schedule;
  $('#season').value = D.season; $('#week').value = D.week;
  indexSchedule();
  state.prevPts = new Map();
  state.firstModelBuilt = false;
  buildDashboard();
  buildModel();
  state.lastUpdated = Date.now();
  renderActive();
  setStatus('Showing <strong>demo data</strong> with simulated live scoring. Enter your Sleeper username and hit Load for your real teams.', 'warn');

  // Simulate live scoring so flashes/updates are visible
  if (demoTimer) clearInterval(demoTimer);
  demoTimer = setInterval(() => {
    if (document.hidden) return;
    demoTickPoints();
    buildDashboard();
    buildModel();
    state.lastUpdated = Date.now();
    renderActive();
  }, 5000);
}

// Nudge a few "live" players' points upward in the demo matchup data
function demoTickPoints() {
  const liveTeams = new Set(state.schedule.filter(g => g.live).flatMap(g => [g.home, g.away]));
  for (const [, entries] of state.matchupsByLeague) {
    for (const e of entries) {
      const starters = e.starters || [];
      // bump 1-2 random starters whose team is live
      let bumps = 0;
      for (let i = 0; i < starters.length && bumps < 2; i++) {
        const pid = starters[i];
        const info = playerInfo(pid);
        if (!liveTeams.has(normalizeTeamTag(info.team))) continue;
        if (Math.random() < 0.4) {
          const add = Math.round((Math.random() * 6 + 0.5) * 10) / 10;
          e.starters_points[i] = Math.round((e.starters_points[i] + add) * 10) / 10;
          if (e.players_points) e.players_points[pid] = e.starters_points[i];
          bumps++;
        }
      }
      e.points = Math.round(e.starters_points.reduce((s, x) => s + x, 0) * 10) / 10;
    }
  }
}

// --- Init ---
async function init() {
  applyTheme(getStoredTheme());
  loadFavorites();
  renderWeeks(18);
  buildNav();
  startClock();

  const url = readUrlState();
  state.view = url.view && VIEWS.some(v => v.id === url.view) ? url.view : (lsGet(VIEW_KEY) || 'matchups');
  $('#username').value = url.username || getStoredUsername() || '';

  try {
    const st = await sleeper.getState();
    $('#season').value = url.season || st.season || new Date().getFullYear();
    $('#week').value = url.week || st.week || st.display_week || 1;
  } catch {
    $('#season').value = url.season || new Date().getFullYear();
    $('#week').value = url.week || 1;
  }

  // Events
  $('#loadBtn').addEventListener('click', load);
  $('#username').addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
  const reload = debounce(() => { if (state.user && !state.demoMode) load(); }, 250);
  $('#season').addEventListener('change', reload);
  $('#week').addEventListener('change', reload);
  $('#themeToggle').addEventListener('click', toggleTheme);
  $('#demoBtn').addEventListener('click', loadDemo);
  $('#lbRefresh').addEventListener('click', () => { if (!state.demoMode) refreshScores(); });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.user && !state.demoMode) { refreshScores(); scheduleLive(); }
  });

  updateNav();
  if ($('#username').value.trim()) load();
  else loadDemo();
}

init();
