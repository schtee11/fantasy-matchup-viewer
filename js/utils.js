/* ============================================================
   Utils — DOM helpers, constants, state, localStorage cache
   ============================================================ */

// --- DOM Helpers ---
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const $el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt) e.textContent = txt;
  return e;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Status Display ---
function setStatus(html, cls = '') {
  const s = $('#status');
  s.innerHTML = html;
  s.className = 'status ' + cls;
}

// --- Test Data ---
const INLINE_TEST_SCHEDULE = [
  { id: 't1', year: new Date().getFullYear(), week: 1, home: 'NYJ', away: 'BUF', kickoff: new Date(Date.now() + 3600e3).toISOString(), home_score: 0, away_score: 0, status: 'Scheduled' },
  { id: 't2', year: new Date().getFullYear(), week: 1, home: 'KC', away: 'BAL', kickoff: new Date(Date.now() + 7200e3).toISOString(), home_score: 0, away_score: 0, status: 'Scheduled' }
];
const DEMO_ROSTER = [
  { pid: 'demo_qb1', full_name: 'Josh Allen', team: 'BUF', position: 'QB' },
  { pid: 'demo_wr1', full_name: 'Garrett Wilson', team: 'NYJ', position: 'WR' },
  { pid: 'demo_te1', full_name: 'Travis Kelce', team: 'KC', position: 'TE' },
  { pid: 'demo_rb1', full_name: 'Derrick Henry', team: 'BAL', position: 'RB' }
];

// --- Application State ---
const state = {
  user: null,
  leagues: [],
  rostersByLeague: new Map(),
  playersIndex: {},
  owned: new Map(),
  schedule: [],
  selectedMatch: null,
  scheduleSource: 'espn',
  demoMode: false,
  statsCache: new Map(),
  leagueSettings: new Map(),
  matchups: new Map(),        // F6: league matchup data
  favorites: new Set(),       // F8: favorite player IDs
  lastExportRows: []          // F3: last rendered rows for export
};
let autoTimer = null;
let refreshInProgress = false; // O4: guard against double-refresh

// --- Team Tag Normalization ---
function normalizeTeamTag(tag) {
  const map = { JAC: 'JAX', LA: 'LAR' };
  return tag ? (map[tag] || tag) : tag;
}

// --- localStorage Cache for Player Index (O2) ---
const PLAYER_CACHE_KEY = 'fmv_players_cache';
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedPlayers() {
  try {
    const raw = localStorage.getItem(PLAYER_CACHE_KEY);
    if (!raw) return null;
    const { timestamp, data } = JSON.parse(raw);
    if (Date.now() - timestamp > PLAYER_CACHE_TTL) {
      localStorage.removeItem(PLAYER_CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(PLAYER_CACHE_KEY);
    return null;
  }
}

function setCachedPlayers(slimData) {
  try {
    localStorage.setItem(PLAYER_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      data: slimData
    }));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

// --- Favorites persistence (F8) ---
const FAVORITES_KEY = 'fmv_favorites';

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) state.favorites = new Set(JSON.parse(raw));
  } catch { /* ignore */ }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch { /* ignore */ }
}

function toggleFavorite(pid) {
  if (state.favorites.has(pid)) {
    state.favorites.delete(pid);
  } else {
    state.favorites.add(pid);
  }
  saveFavorites();
}

// --- Theme persistence (F4) ---
const THEME_KEY = 'fmv_theme';

function getStoredTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
}

function setStoredTheme(theme) {
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
  setStoredTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// --- URL State / Deep Linking (F5) ---
function readUrlState() {
  const params = new URLSearchParams(window.location.hash.replace('#', ''));
  return {
    username: params.get('user') || '',
    season: params.get('season') || '',
    week: params.get('week') || '',
    league: params.get('league') || ''
  };
}

function writeUrlState() {
  const params = new URLSearchParams();
  const username = $('#username').value.trim();
  const season = $('#season').value;
  const week = $('#week').value;
  const league = $('#league').value;
  if (username && username !== 'Username') params.set('user', username);
  if (season) params.set('season', season);
  if (week) params.set('week', week);
  if (league && league !== '*') params.set('league', league);
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : window.location.pathname);
}

// --- Debounce Utility (O4) ---
function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// --- Batch Fetch Utility (O1) ---
async function batchFetch(items, fn, concurrency = 3) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    if (i + concurrency < items.length) await sleep(90);
  }
  return results;
}
