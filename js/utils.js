/* ============================================================
   Utils — DOM helpers, state, constants, persistence
   ============================================================ */

// --- DOM Helpers ---
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const $el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

// --- Number formatting ---
function fmtPts(n) {
  const v = Number(n) || 0;
  return v.toFixed(2);
}

// --- Status banner ---
function setStatus(html, cls = '') {
  const s = $('#status');
  if (!s) return;
  s.innerHTML = html;
  s.className = 'status' + (cls ? ' ' + cls : '');
}

// --- Application State ---
const state = {
  user: null,
  season: null,
  week: null,
  leagues: [],                 // [{league_id, name}]
  rostersByLeague: new Map(),  // leagueId -> [roster]
  usersByLeague: new Map(),    // leagueId -> Map(user_id -> user)
  matchupsByLeague: new Map(), // leagueId -> [matchup entries]
  leagueMeta: new Map(),       // leagueId -> {scoring_settings, roster_positions, name, avatar}
  playersIndex: {},            // pid -> slim player
  schedule: [],                // NFL games this week
  scheduleByTeam: new Map(),   // team tag -> game
  scheduleSource: 'espn',
  demoMode: false,
  cards: [],                   // built dashboard cards
  favorites: new Set(),        // starred player ids
  filterLeague: '*',
  filterResult: 'all',         // all | winning | losing
  onlyStarred: false
};
let autoTimer = null;
let refreshInProgress = false;

// --- Team tag normalization (Sleeper/ESPN quirks) ---
function normalizeTeamTag(tag) {
  if (!tag) return tag;
  const map = { JAC: 'JAX', LA: 'LAR', WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
  return map[tag] || tag;
}

// --- Position color classes ---
function posClass(pos) {
  const p = (pos || '').toUpperCase();
  if (p === 'QB') return 'pos-qb';
  if (p === 'RB') return 'pos-rb';
  if (p === 'WR') return 'pos-wr';
  if (p === 'TE') return 'pos-te';
  if (p === 'K') return 'pos-k';
  if (p === 'DEF' || p === 'DST') return 'pos-def';
  if (p === 'FLEX' || p === 'WRRB_FLEX' || p === 'REC_FLEX') return 'pos-flex';
  if (p === 'SUPER_FLEX' || p === 'SUPERFLEX' || p === 'QB/WR/RB/TE') return 'pos-sflex';
  return 'pos-other';
}

// --- Roster slot label normalization ---
function slotLabel(slot) {
  const map = {
    WRRB_FLEX: 'FLEX', REC_FLEX: 'FLEX', FLEX: 'FLEX',
    SUPER_FLEX: 'SFLX', SUPERFLEX: 'SFLX',
    DEF: 'DEF', DST: 'DEF', IDP_FLEX: 'IDP'
  };
  return map[slot] || slot;
}

// --- localStorage cache for player index ---
const PLAYER_CACHE_KEY = 'fmv_players_cache';
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000;

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

function setCachedPlayers(data) {
  try {
    localStorage.setItem(PLAYER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
  } catch { /* quota — skip */ }
}

// --- Username memory ---
const USERNAME_KEY = 'fmv_username';
function getStoredUsername() {
  try { return localStorage.getItem(USERNAME_KEY) || ''; } catch { return ''; }
}
function setStoredUsername(u) {
  try { localStorage.setItem(USERNAME_KEY, u); } catch { /* ignore */ }
}

// --- Favorites persistence ---
const FAVORITES_KEY = 'fmv_favorites';
function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) state.favorites = new Set(JSON.parse(raw));
  } catch { /* ignore */ }
}
function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites])); } catch { /* ignore */ }
}
function toggleFavorite(pid) {
  if (state.favorites.has(pid)) state.favorites.delete(pid);
  else state.favorites.add(pid);
  saveFavorites();
}

// --- Theme persistence ---
const THEME_KEY = 'fmv_theme';
function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY)
      || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  } catch { return 'dark'; }
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

// --- URL deep-link state ---
function readUrlState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    username: params.get('user') || '',
    season: params.get('season') || '',
    week: params.get('week') || ''
  };
}
function writeUrlState() {
  const params = new URLSearchParams();
  const u = ($('#username').value || '').trim();
  if (u) params.set('user', u);
  if (state.season) params.set('season', state.season);
  if (state.week) params.set('week', state.week);
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : window.location.pathname);
}

// --- Debounce ---
function debounce(fn, delay) {
  let t;
  return function (...a) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, a), delay);
  };
}

// --- Batched concurrency-limited fetch ---
async function batchFetch(items, fn, concurrency = 4) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));
    results.push(...settled);
    if (i + concurrency < items.length) await sleep(80);
  }
  return results;
}

// --- Sleeper avatar URL ---
function avatarUrl(avatar, size = 'thumbs') {
  if (!avatar) return null;
  if (/^https?:/.test(avatar)) return avatar;
  return `https://sleepercdn.com/avatars/${size}/${avatar}`;
}

// --- Initials fallback for avatars ---
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || '').join('').toUpperCase() || '?';
}
