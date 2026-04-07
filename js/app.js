/* ============================================================
   App — Init, refresh, event wiring, URL state, auto-refresh
   ============================================================ */

// --- Schedule-Only Refresh ---
async function refreshScheduleOnly() {
  try {
    const yr = Number($('#season').value);
    const wk = Number($('#week').value);
    const sched = await scheduleProvider.espn(yr, wk);
    state.schedule = sched;
    renderMatches();
    renderByeWeek();
    renderWatchlist();
  } catch (e) { /* silent fail on auto-refresh */ }
}

// --- Smart Auto-Refresh (O5) ---
function startAutoRefresh() {
  if (autoTimer) clearInterval(autoTimer);

  // Determine refresh interval based on game states
  const hasLiveGames = state.schedule.some(g =>
    g.status && g.status !== 'Scheduled' && g.status !== 'Final'
  );
  const allFinal = state.schedule.length > 0 && state.schedule.every(g => g.status === 'Final');

  if (allFinal) return; // No need to refresh

  const interval = hasLiveGames ? 20000 : 45000;
  autoTimer = setInterval(() => {
    if (document.hidden) return; // skip refresh when tab is hidden
    refreshScheduleOnly();
  }, interval);
}

// --- Visibility Change Handler (O5) ---
function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.schedule.length) {
      // Refresh immediately when tab becomes visible
      refreshScheduleOnly();
      startAutoRefresh();
    }
  });
}

// --- Main Refresh (O1, O2, O3, O4, O6) ---
async function refresh() {
  // O4: Guard against double-refresh
  if (refreshInProgress) return;
  refreshInProgress = true;

  const username = $('#username').value.trim();
  const season = Number($('#season').value);
  const week = Number($('#week').value);

  try {
    $('#refresh').disabled = true;
    setStatus('<span class="loading">Loading...</span>', '');

    // Auto-detect season/week if missing
    if (!season || !week) {
      try {
        const st = await sleeper.getState();
        if (!$('#season').value) $('#season').value = st.season || new Date().getFullYear();
        if (!$('#week').value) $('#week').value = st.week || 1;
      } catch (e) { /* use defaults */ }
    }

    if (!state.demoMode) {
      // O3: Progressive loading — step 1: user
      setStatus('<span class="loading">Fetching user data...</span>', '');
      const user = await sleeper.getUser(username);
      state.user = user;

      // O3: step 2: leagues
      setStatus('<span class="loading">Loading leagues...</span>', '');
      const leaguesRaw = await sleeper.getLeagues(user.user_id, Number($('#season').value));
      state.leagues = (leaguesRaw || []).map(l => ({ league_id: l.league_id, name: l.name }));
      renderLeagues();

      // O1 + O3: step 3: rosters (parallel batched)
      setStatus(`<span class="loading">Loading rosters (${state.leagues.length} leagues)...</span>`, '');
      state.rostersByLeague = new Map();
      await batchFetch(state.leagues, async (lg) => {
        try {
          const ros = await sleeper.getRosters(lg.league_id);
          state.rostersByLeague.set(lg.league_id, ros);
        } catch (e) {
          // O6: Skip failed leagues gracefully
          console.warn(`Failed to fetch rosters for ${lg.name}: ${e.message}`);
        }
      }, 3);

      // O2 + O3: step 4: player index (cached)
      if (!Object.keys(state.playersIndex).length) {
        const cached = getCachedPlayers();
        if (cached) {
          setStatus('<span class="loading">Loading player index (cached)...</span>', '');
          state.playersIndex = cached;
        } else {
          setStatus('<span class="loading">Fetching player database (first load is slow)...</span>', '');
          const idx = await sleeper.getPlayers();
          const slim = buildSlimPlayerIndex(idx);
          state.playersIndex = slim;
          setCachedPlayers(slim);
        }
      }

      // O1 + O3: step 5: league settings (parallel batched)
      setStatus('<span class="loading">Loading league settings...</span>', '');
      state.leagueSettings = new Map();
      await batchFetch(state.leagues, async (lg) => {
        try {
          const full = await sleeper.getLeague(lg.league_id);
          state.leagueSettings.set(lg.league_id, full?.scoring_settings || {});
        } catch (e) {
          // O6: Skip failed leagues gracefully
          console.warn(`Failed to fetch settings for ${lg.name}: ${e.message}`);
        }
      }, 3);

      // F6: Fetch matchup data for opponent roster view
      setStatus('<span class="loading">Loading matchup data...</span>', '');
      const currentWeek = Number($('#week').value);
      await fetchLeagueMatchups(currentWeek);
    }

    // Build owned index
    buildOwnedIndex();

    // Fetch schedule
    setStatus('<span class="loading">Fetching NFL schedule...</span>', '');
    state.scheduleSource = 'espn';
    try {
      state.schedule = await scheduleProvider.espn(Number($('#season').value), Number($('#week').value));
    } catch (e) {
      state.schedule = await scheduleProvider.inline(Number($('#season').value), Number($('#week').value));
      state.scheduleSource = 'inline-test';
    }

    // Render everything
    renderMatches();
    renderByeWeek();
    renderWatchlist();
    $('#pickedTitle').textContent = '';
    $('#players').innerHTML = '';

    // F5: Update URL state
    writeUrlState();

    setStatus(
      `Ready. Schedule source: <span class="badge">${state.scheduleSource}</span>` +
      `${state.demoMode ? ' \u00B7 <span class="badge">DEMO roster</span>' : ''}` +
      ` \u00B7 ${state.owned.size} players tracked across ${state.leagues.length} league(s)`,
      'ok'
    );

    startAutoRefresh();

  } catch (err) {
    setStatus('Error: ' + err.message, 'err');
    alert('Error: ' + err.message + '\nIf this is a CORS/network issue, try the Diagnostics & Test Data buttons below.');
  } finally {
    $('#refresh').disabled = false;
    refreshInProgress = false;
  }
}

// --- Debounced Refresh for Selects (O4) ---
const debouncedRefresh = debounce(refresh, 300);

// --- Init ---
async function init() {
  // F4: Apply stored theme
  applyTheme(getStoredTheme());

  // F8: Load favorites
  loadFavorites();

  renderWeeks(18);

  // F5: Read URL state and populate fields
  const urlState = readUrlState();
  if (urlState.username) $('#username').value = urlState.username;

  // Fetch current NFL state for defaults
  try {
    const st = await sleeper.getState();
    $('#season').value = urlState.season || st.season || new Date().getFullYear();
    $('#week').value = urlState.week || st.week || 1;
  } catch {
    $('#season').value = urlState.season || new Date().getFullYear();
    $('#week').value = urlState.week || 1;
  }

  // --- Event Listeners ---
  $('#refresh').addEventListener('click', refresh);
  $('#week').addEventListener('change', debouncedRefresh);
  $('#season').addEventListener('change', debouncedRefresh);
  $('#league').addEventListener('change', () => {
    if (state.selectedMatch) selectMatch(state.selectedMatch);
    writeUrlState();
  });

  // F4: Theme toggle
  $('#themeToggle').addEventListener('click', toggleTheme);

  // Diagnostics
  $('#btnSelfTest').addEventListener('click', async () => {
    const out = $('#diagOut');
    out.textContent = 'Running...';
    const results = [];
    async function step(n, f) {
      const t0 = performance.now();
      try {
        await f();
        const dt = (performance.now() - t0).toFixed(0);
        results.push(`\u2705 ${n} (${dt}ms)`);
      } catch (e) {
        results.push(`\u274C ${n}: ${e.message}`);
      }
    }
    await step('Sleeper state', () => sleeper.getState());
    await step('User lookup', () => sleeper.getUser($('#username').value.trim()));
    await step('Schedule (ESPN)', () => scheduleProvider.espn(Number($('#season').value), Number($('#week').value)));

    // Check localStorage cache
    const cached = getCachedPlayers();
    results.push(cached ? '\u2705 Player cache: present in localStorage' : '\u26A0\uFE0F Player cache: not found (will fetch on next refresh)');

    out.innerHTML = results.map(r => `<div>${r}</div>`).join('');
  });

  $('#btnTestSchedule').addEventListener('click', async () => {
    const yr = Number($('#season').value) || new Date().getFullYear();
    const wk = Number($('#week').value) || 1;
    state.schedule = await scheduleProvider.inline(yr, wk);
    state.scheduleSource = 'inline-test';
    renderMatches();
    renderByeWeek();
    setStatus('Loaded inline TEST schedule. Pick a matchup, or inject a demo roster to see players.', 'ok');
  });

  $('#btnDemoRoster').addEventListener('click', async () => {
    state.demoMode = true;
    state.user = { user_id: 'demo_user' };
    state.leagues = [{ league_id: 'demo', name: 'DEMO League' }];
    renderLeagues();
    buildOwnedIndex();
    renderMatches();
    renderByeWeek();
    renderWatchlist();
    setStatus('DEMO roster injected. Use inline TEST schedule for a full offline demo.', 'ok');
  });

  // Clear player cache button
  $('#btnClearCache').addEventListener('click', () => {
    localStorage.removeItem(PLAYER_CACHE_KEY);
    state.playersIndex = {};
    $('#diagOut').textContent = 'Player cache cleared. Next refresh will fetch fresh data.';
  });

  // Modal
  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // O5: Visibility handler
  setupVisibilityHandler();

  // Kick off initial refresh
  refresh();
}

// --- Start ---
init();
