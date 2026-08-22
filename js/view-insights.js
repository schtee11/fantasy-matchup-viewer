/* ============================================================
   View: Insights — cross-league ways to slice your day
   ============================================================ */

function renderInsights(host) {
  const m = state.model;
  if (!m) { host.appendChild(emptyEl('Load your teams to unlock insights.')); return; }

  const grid = $el('div', 'insights-grid');

  // 1) Multi-league exposure
  const exposed = m.playerList.filter(p => p.exposure > 1)
    .sort((a, b) => b.exposure - a.exposure || b.totalPts - a.totalPts);
  grid.appendChild(insightCard('🎯 Multi-league exposure',
    'Players you start in more than one league — your day swings hardest on these.',
    exposed.length ? exposed.map(p => rankRow(
      `${posChipHtml(p.pos)} <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.team || '')}</span>`,
      `<span class="exp-badge">×${p.exposure}</span> ${gameChipHtml(p.game)}`,
      fmtPts1(p.totalPts)
    )) : [muted('You have no players started in multiple leagues this week.')]
  ));

  // 2) Villains — opponents scoring against you
  const villains = m.villainList.slice()
    .sort((a, b) => b.totalPts - a.totalPts).slice(0, 12);
  grid.appendChild(insightCard('⚔ Villains',
    'Opponents’ starters piling up points against you across your matchups.',
    villains.length ? villains.map(p => rankRow(
      `${posChipHtml(p.pos)} <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.team || '')}</span>`,
      `${p.exposure > 1 ? `<span class="exp-badge">in ${p.exposure}</span> ` : ''}${gameChipHtml(p.game)}`,
      fmtPts1(p.totalPts)
    )) : [muted('No opponent data yet.')]
  ));

  // 3) Top performers (yours)
  const top = m.playerList.slice().sort((a, b) => b.totalPts - a.totalPts).slice(0, 10);
  grid.appendChild(insightCard('🔥 Your top performers',
    'Highest combined fantasy output across all your teams today.',
    top.length ? top.map(p => rankRow(
      `${posChipHtml(p.pos)} <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.team || '')}</span>`,
      gameChipHtml(p.game),
      fmtPts1(p.totalPts)
    )) : [muted('No player points yet.')]
  ));

  // 4) Duds — lowest among players whose game is live/final
  const played = m.playerList.filter(p => p.game.kind === 'live' || p.game.kind === 'final');
  const duds = played.slice().sort((a, b) => a.totalPts - b.totalPts).slice(0, 10);
  grid.appendChild(insightCard('🧊 Underperformers',
    'Started players who have played but haven’t produced.',
    duds.length ? duds.map(p => rankRow(
      `${posChipHtml(p.pos)} <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.team || '')}</span>`,
      gameChipHtml(p.game),
      fmtPts1(p.totalPts)
    )) : [muted('No games have started yet.')]
  ));

  // 5) Tight matchups — need attention
  const tight = m.cards.filter(c => c.hasMatchup && c.result !== 'none')
    .map(c => ({ c, diff: Math.abs(c.me.total - c.opp.total) }))
    .sort((a, b) => a.diff - b.diff).slice(0, 8);
  grid.appendChild(insightCard('⚖ Closest matchups',
    'Where the margin is thin — the ones to sweat.',
    tight.length ? tight.map(({ c, diff }) => rankRow(
      `<strong>${esc(c.leagueName)}</strong> <span class="muted">vs ${esc(c.opp.name)}</span>`,
      `<span class="vs vs-${c.result === 'winning' ? 'win' : c.result === 'losing' ? 'loss' : 'tie'}">${c.result === 'winning' ? 'WIN' : c.result === 'losing' ? 'LOSS' : 'TIE'}</span>`,
      `±${fmtPts1(diff)}`
    )) : [muted('No active matchups.')]
  ));

  // 6) By position — where your points come from
  const byPos = {};
  for (const p of m.playerList) { const k = (p.pos || '?').toUpperCase(); byPos[k] = (byPos[k] || 0) + p.totalPts; }
  const posRows = Object.entries(byPos).sort((a, b) => b[1] - a[1]);
  grid.appendChild(insightCard('📊 Points by position',
    'Combined output by position across every team.',
    posRows.length ? posRows.map(([pos, pts]) => rankRow(
      posChipHtml(pos), '', fmtPts1(pts)
    )) : [muted('No points yet.')]
  ));

  host.appendChild(grid);
}

function insightCard(title, sub, rows) {
  const card = $el('div', 'icard');
  const h = $el('div', 'icard-head');
  h.appendChild($el('div', 'icard-title', title));
  h.appendChild($el('div', 'icard-sub', sub));
  card.appendChild(h);
  const body = $el('div', 'icard-body');
  rows.forEach((r, i) => { if (typeof r === 'string') { const d = $el('div'); d.innerHTML = r; body.appendChild(d); } else body.appendChild(r); });
  card.appendChild(body);
  return card;
}

function rankRow(mainHtml, midHtml, valText) {
  const row = $el('div', 'irow');
  const main = $el('div', 'irow-main'); main.innerHTML = mainHtml;
  const mid = $el('div', 'irow-mid'); mid.innerHTML = midHtml || '';
  const val = $el('div', 'irow-val', valText);
  row.appendChild(main); row.appendChild(mid); row.appendChild(val);
  return row;
}
function muted(text) { return `<div class="muted" style="padding:8px 2px">${esc(text)}</div>`; }
