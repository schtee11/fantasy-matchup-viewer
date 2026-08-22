/* ============================================================
   App — init, load flow, auto-refresh, events, demo mode
   ============================================================ */

// --- Live score refresh (matchups + schedule only) ---
async function refreshScores() {
  if (state.demoMode) return;
  try {
    const week = state.week;
    // Schedule
    try {
      state.schedule = await scheduleProvider.espn(state.season, week);
      indexSchedule();
    } catch { /* keep old schedule */ }
    // Matchups
    await batchFetch(state.leagues, async lg => {
      try {
        const m = await sleeper.getMatchups(lg.league_id, week);
        state.matchupsByLeague.set(lg.league_id, m || []);
      } catch { /* skip */ }
    });
    buildDashboard();
    renderDashboard();
  } catch { /* silent */ }
}

function startAutoRefresh() {
  if (autoTimer) clearInterval(autoTimer);
  if (state.demoMode) return;
  const hasLive = state.schedule.some(g => g.live);
  const anyPre = state.schedule.some(g => g.status === 'pre');
  const allDone = state.schedule.length > 0 && state.schedule.every(g => g.status === 'Final');
  if (allDone && !anyPre) return;
  const interval = hasLive ? 25000 : 60000;
  autoTimer = setInterval(() => {
    if (document.hidden) return;
    refreshScores();
  }, interval);
}

// --- Main load ---
async function load() {
  if (refreshInProgress) return;
  refreshInProgress = true;

  const username = ($('#username').value || '').trim();
  $('#loadBtn').disabled = true;
  $('#loadBtn').textContent = 'Loading…';

  try {
    if (!username) throw new Error('Enter your Sleeper username first.');
    setStoredUsername(username);
    state.demoMode = false;

    // Season / week
    state.season = Number($('#season').value) || new Date().getFullYear();
    state.week = Number($('#week').value) || 1;

    setStatus('<span class="loading">Looking up user…</span>');
    const user = await sleeper.getUser(username);
    if (!user || !user.user_id) throw new Error(`User "${username}" not found on Sleeper.`);
    state.user = user;

    setStatus('<span class="loading">Loading your leagues…</span>');
    const leaguesRaw = await sleeper.getLeagues(user.user_id, state.season);
    state.leagues = (leaguesRaw || []).map(l => ({ league_id: l.league_id, name: l.name }));
    // stash league meta (avatar, roster_positions come later from getLeague)
    state.leagueMeta = new Map();
    for (const l of (leaguesRaw || [])) {
      state.leagueMeta.set(l.league_id, {
        name: l.name,
        avatar: l.avatar,
        roster_positions: l.roster_positions || [],
        scoring_settings: l.scoring_settings || {}
      });
    }
    renderLeagueFilter();

    if (!state.leagues.length) {
      state.cards = [];
      renderDashboard();
      setStatus(`No leagues found for <strong>${esc(username)}</strong> in ${state.season}. Try a different season.`, 'warn');
      return;
    }

    // Player index (cached)
    if (!Object.keys(state.playersIndex).length) {
      const cached = getCachedPlayers();
      if (cached) {
        state.playersIndex = cached;
      } else {
        setStatus('<span class="loading">Fetching NFL player database (first load is slow)…</span>');
        const idx = await sleeper.getPlayers();
        state.playersIndex = buildSlimPlayerIndex(idx);
        setCachedPlayers(state.playersIndex);
      }
    }

    // Per-league: rosters, users, matchups (batched)
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

    // NFL schedule
    setStatus('<span class="loading">Fetching NFL schedule…</span>');
    try {
      state.schedule = await scheduleProvider.espn(state.season, state.week);
    } catch { state.schedule = []; }
    indexSchedule();

    buildDashboard();
    renderDashboard();
    writeUrlState();

    const withM = state.cards.filter(c => c.hasMatchup);
    setStatus(`Loaded <strong>${state.cards.length}</strong> team(s) for <strong>${esc(username)}</strong> · Week ${state.week}, ${state.season}`
      + (withM.length ? ` · ${withM.filter(c => c.result === 'winning').length} winning, ${withM.filter(c => c.result === 'losing').length} losing` : ''), 'ok');

    startAutoRefresh();
  } catch (err) {
    setStatus('Error: ' + esc(err.message), 'err');
  } finally {
    $('#loadBtn').disabled = false;
    $('#loadBtn').textContent = 'Load';
    refreshInProgress = false;
  }
}

// --- Demo mode (offline, no network) ---
function loadDemo() {
  state.demoMode = true;
  if (autoTimer) clearInterval(autoTimer);
  const D = buildDemoData();
  state.user = D.user;
  state.season = D.season;
  state.week = D.week;
  state.leagues = D.leagues;
  state.leagueMeta = D.leagueMeta;
  state.rostersByLeague = D.rostersByLeague;
  state.usersByLeague = D.usersByLeague;
  state.matchupsByLeague = D.matchupsByLeague;
  state.playersIndex = D.playersIndex;
  state.schedule = D.schedule;
  $('#season').value = D.season;
  $('#week').value = D.week;
  indexSchedule();
  renderLeagueFilter();
  buildDashboard();
  renderDashboard();
  setStatus('Showing <strong>demo data</strong> (offline). Enter your Sleeper username and hit Load for your real teams.', 'warn');
}

// --- Init ---
async function init() {
  applyTheme(getStoredTheme());
  loadFavorites();
  renderWeeks(18);

  const url = readUrlState();
  const storedUser = getStoredUsername();
  $('#username').value = url.username || storedUser || '';

  // Defaults for season/week
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

  $('#leagueFilter').addEventListener('change', e => { state.filterLeague = e.target.value; renderDashboard(); });
  $$('.result-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.result-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.filterResult = tab.dataset.result;
    renderDashboard();
  }));
  $('#starredToggle').addEventListener('click', () => {
    state.onlyStarred = !state.onlyStarred;
    $('#starredToggle').classList.toggle('active', state.onlyStarred);
    renderDashboard();
  });
  $('#expandAll').addEventListener('click', () => {
    const cards = $$('#dashboard .tcard');
    const anyClosed = cards.some(c => !c.open);
    cards.forEach(c => c.open = anyClosed);
    $('#expandAll').textContent = anyClosed ? 'Collapse all' : 'Expand all';
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.user && !state.demoMode) { refreshScores(); startAutoRefresh(); }
  });

  // Auto-load if we have a username
  if ($('#username').value.trim()) load();
  else loadDemo();
}

init();
