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
function fmtPts(n) { return (Number(n) || 0).toFixed(2); }
function fmtPts1(n) { return (Number(n) || 0).toFixed(1); }

// --- Relative time ---
function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
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
  view: 'matchups',            // matchups | games | players | insights

  leagues: [],                 // [{league_id, name}]
  rostersByLeague: new Map(),
  usersByLeague: new Map(),
  matchupsByLeague: new Map(),
  leagueMeta: new Map(),
  playersIndex: {},
  schedule: [],                // enriched NFL games
  scheduleByTeam: new Map(),
  scheduleSource: 'espn',

  cards: [],                   // per-league matchup cards
  model: null,                 // unified command-center model

  demoMode: false,
  favorites: new Set(),
  openLeagues: new Set(),      // expanded matchup cards (survives re-render)

  // filters
  filterLeague: '*',
  filterResult: 'all',
  onlyStarred: false,
  playerPos: 'all',
  playerStatus: 'all',
  playerLeague: '*',
  playerSort: 'pts',
  gameFilter: 'all',           // all | mine

  // live engine
  lastUpdated: 0,
  prevPts: new Map(),          // key pid@leagueId -> pts (for flash)
  bumped: new Set(),
  firstModelBuilt: false
};
let autoTimer = null;
let clockTimer = null;
let demoTimer = null;
let refreshInProgress = false;

// --- Team tag normalization ---
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
  if (p === 'SFLX' || p === 'SUPER_FLEX' || p === 'SUPERFLEX') return 'pos-sflex';
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
    if (Date.now() - timestamp > PLAYER_CACHE_TTL) { localStorage.removeItem(PLAYER_CACHE_KEY); return null; }
    return data;
  } catch { localStorage.removeItem(PLAYER_CACHE_KEY); return null; }
}
function setCachedPlayers(data) {
  try { localStorage.setItem(PLAYER_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data })); } catch { /* quota */ }
}

// --- Simple persistence helpers ---
function lsGet(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

const USERNAME_KEY = 'fmv_username';
const getStoredUsername = () => lsGet(USERNAME_KEY);
const setStoredUsername = u => lsSet(USERNAME_KEY, u);

const VIEW_KEY = 'fmv_view';

// --- Favorites ---
const FAVORITES_KEY = 'fmv_favorites';
function loadFavorites() {
  try { const raw = localStorage.getItem(FAVORITES_KEY); if (raw) state.favorites = new Set(JSON.parse(raw)); } catch { /* ignore */ }
}
function saveFavorites() { lsSet(FAVORITES_KEY, JSON.stringify([...state.favorites])); }
function toggleFavorite(pid) {
  if (state.favorites.has(pid)) state.favorites.delete(pid); else state.favorites.add(pid);
  saveFavorites();
}

// --- Theme ---
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
  lsSet(THEME_KEY, theme);
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
    week: params.get('week') || '',
    view: params.get('view') || ''
  };
}
function writeUrlState() {
  const params = new URLSearchParams();
  const u = ($('#username')?.value || '').trim();
  if (u) params.set('user', u);
  if (state.season) params.set('season', state.season);
  if (state.week) params.set('week', state.week);
  if (state.view && state.view !== 'matchups') params.set('view', state.view);
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : window.location.pathname);
}

// --- Debounce ---
function debounce(fn, delay) {
  let t;
  return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), delay); };
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

// --- Avatars ---
function avatarUrl(avatar, size = 'thumbs') {
  if (!avatar) return null;
  if (/^https?:/.test(avatar)) return avatar;
  return `https://sleepercdn.com/avatars/${size}/${avatar}`;
}
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0] || '').join('').toUpperCase() || '?';
}
