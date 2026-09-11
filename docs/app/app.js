/* ═══════════════════════════════════════════════════════════════════
   LPCMI Recruitment — interface v2

   Renders from the JSON bundles written by web/build_data.py. Hash
   routing, so it works on GitHub Pages with no server config.
   ═══════════════════════════════════════════════════════════════════ */

const S = { clubs: [], leagues: [], meta: null, people: [], ready: false };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Who a recruiter actually wants to reach, in order. Ranking beats a single
// regex here: "Assistant Manager" ends in "Manager", so a naive /manager$/ put
// three assistants above the Sporting Director.
const ROLE_RANK = [
  /sporting director|technical director|director of football/i,
  /director of recruitment|head of recruitment|head of scouting|chief scout/i,
  /^(manager|head coach)$/i,
  /recruitment|scout/i,
];

function roleRank(r) {
  const role = (r || '').trim();
  for (let i = 0; i < ROLE_RANK.length; i++) if (ROLE_RANK[i].test(role)) return i;
  return ROLE_RANK.length;
}

const isKeyRole = r => roleRank(r) < 3;

const ICON = {
  home: 'M3 10.5 12 4l9 6.5M5.5 9.5V20h13V9.5',
  clubs: 'M4 20V7l8-4 8 4v13M9 20v-5h6v5M9 10h.01M15 10h.01',
  people: 'M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  players: 'M12 3.5 4.5 7v5c0 4.2 3.1 7.6 7.5 8.5 4.4-.9 7.5-4.3 7.5-8.5V7z',
  trophy: 'M7 4h10v4a5 5 0 0 1-10 0zM7 5.5H4.5V7a3 3 0 0 0 3 3M17 5.5h2.5V7a3 3 0 0 1-3 3M12 13v4M9 20h6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5',
  back: 'M15 18l-6-6 6-6',
  ext: 'M14 5h5v5M19 5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  menu: 'M4 7h16M4 12h16M4 17h16',
};

const svg = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;

const crestImg = (c, cls) => c.crest
  ? `<img class="${cls}" src="../${esc(c.crest)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
  : `<span class="${cls}" aria-hidden="true"></span>`;

/* ── Routing ──────────────────────────────────────────────────────── */
const routes = [
  { re: /^\/clubs\/([^/]+)$/, view: clubPage },
  { re: /^\/clubs$/, view: clubsPage },
  { re: /^\/?$/, view: clubsPage },
];

function go(hash) { location.hash = hash; }

function render() {
  const path = (location.hash || '#/').slice(1) || '/';
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      $('#view').innerHTML = r.view(...m.slice(1));
      document.querySelectorAll('.nav-item[data-route]').forEach(el => {
        const on = path.startsWith(el.dataset.route);
        el.toggleAttribute('aria-current', on);
        if (on) el.setAttribute('aria-current', 'page');
      });
      window.scrollTo(0, 0);
      $('.shell').dataset.rail = '';
      return;
    }
  }
  $('#view').innerHTML = `<div class="page"><p class="empty">Nothing here.</p></div>`;
}

/* ── Clubs index ──────────────────────────────────────────────────── */
const F = { q: '', league: '', need: '' };

function clubsPage() {
  const leagues = [...new Set(S.clubs.map(c => c.lg).filter(Boolean))].sort();
  const needs = [...new Set(S.clubs.flatMap(c => c.needs.map(n => n.pos)))].sort();
  return `
  <div class="page">
    <div class="page-head">
      <h1>Clubs</h1>
      <p>Every tracked club, with its staff, requirements and league position in one place.</p>
    </div>
    <div class="filters">
      <input class="field" id="f-q" type="search" placeholder="Search clubs…" value="${esc(F.q)}" style="flex:1 1 220px">
      <select class="field" id="f-league"><option value="">All leagues</option>
        ${leagues.map(l => `<option${l === F.league ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="f-need"><option value="">Any requirement</option>
        ${needs.map(n => `<option${n === F.need ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      <span class="count" id="f-count"></span>
    </div>
    <div class="grid" id="club-grid"></div>
  </div>`;
}

function filtered() {
  const q = F.q.trim().toLowerCase();
  return S.clubs.filter(c =>
    (!q || c.name.toLowerCase().includes(q) || (c.lg || '').toLowerCase().includes(q)) &&
    (!F.league || c.lg === F.league) &&
    (!F.need || c.needs.some(n => n.pos === F.need)));
}

function zone(c) {
  if (!c.table) return '';
  const total = (S.leagues.find(l => l.name === c.lg)?.table || []).length;
  if (c.table.pos <= 2) return 'up';
  if (total && c.table.pos > total - 3) return 'down';
  return '';
}

function clubCard(c) {
  const staffN = c.staff.length;
  return `<a class="club-card" href="#/clubs/${esc(c.slug)}">
    <div class="cc-top">
      ${crestImg(c, 'cc-crest')}
      <div class="cc-id">
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-league">${esc(c.lg || '—')}</div>
      </div>
      ${c.table ? `<div class="pos-pill ${zone(c)}">${c.table.pos}</div>` : ''}
    </div>
    ${c.needs.length ? `<div class="needs">${c.needs.slice(0, 7).map(n =>
      `<span class="need">${esc(n.pos)}</span>`).join('')}</div>` : ''}
    <div class="cc-meta">
      <span>${staffN} staff</span>
      ${c.squadSize ? `<span>${c.squadSize} tracked</span>` : ''}
    </div>
  </a>`;
}

function paintGrid() {
  const list = filtered();
  const grid = $('#club-grid');
  if (!grid) return;
  grid.innerHTML = list.length
    ? list.map(clubCard).join('')
    : `<p class="empty">No clubs match those filters.</p>`;
  $('#f-count').textContent = `${list.length} of ${S.clubs.length}`;
}

/* ── Club page ────────────────────────────────────────────────────── */
function clubPage(slug) {
  const c = S.clubs.find(x => x.slug === decodeURIComponent(slug));
  if (!c) return `<div class="page"><p class="empty">Club not found.</p></div>`;

  const staff = [...c.staff].sort((a, b) =>
    roleRank(a.r) - roleRank(b.r) || (a.n || '').localeCompare(b.n || ''));

  const squad = Object.entries(c.squad).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...squad.map(s => s[1]));
  const t = c.table;
  const z = zone(c);

  return `
  <div class="page">
    <a class="back" href="#/clubs">${svg('back')} All clubs</a>

    <div class="club-head">
      ${crestImg(c, '')}
      <div>
        <h1>${esc(c.name)}</h1>
        <div class="club-sub">
          <span>${esc(c.lg || 'League unknown')}</span>
          ${c.tm ? `<a href="${esc(c.tm)}" target="_blank" rel="noopener">Transfermarkt ${svg('ext')}</a>` : ''}
          ${c.staffUrl ? `<a href="${esc(c.staffUrl)}" target="_blank" rel="noopener">Staff page ${svg('ext')}</a>` : ''}
        </div>
      </div>
    </div>

    <div class="stats">
      ${t ? `<div class="stat ${z}"><b>${t.pos}</b><span>Position</span></div>
             <div class="stat"><b>${t.pts ?? '—'}</b><span>Points</span></div>
             <div class="stat"><b>${t.p ?? '—'}</b><span>Played</span></div>
             <div class="stat"><b>${t.gd ?? '—'}</b><span>Goal diff</span></div>` : ''}
      <div class="stat"><b>${c.staff.length}</b><span>Staff</span></div>
      <div class="stat"><b>${c.needs.length}</b><span>Requirements</span></div>
    </div>

    <div class="cols">
      <section class="panel">
        <h2>Staff <em>${c.staff.length}</em></h2>
        ${staff.length ? staff.map(s => `
          <div class="row">
            <div class="row-main">
              <div class="row-name">${esc(s.n)}</div>
              ${s.nat ? `<div class="row-sub">${esc(s.nat)}</div>` : ''}
            </div>
            <span class="role${isKeyRole(s.r) ? ' key' : ''}">${esc(s.r || '—')}</span>
            ${s.tm ? `<a class="ext" href="${esc(s.tm)}" target="_blank" rel="noopener"
                        aria-label="Transfermarkt profile for ${esc(s.n)}">${svg('ext')}</a>` : ''}
          </div>`).join('') : `<p class="empty">No staff recorded.</p>`}
      </section>

      <div style="display:grid;gap:18px">
        <section class="panel">
          <h2>Requirements <em>${c.needs.length}</em></h2>
          ${c.needs.length ? c.needs.map(n => `
            <div class="row">
              <div class="row-main">
                <div class="row-name">${esc(n.label || n.pos)}</div>
                ${n.type ? `<div class="row-sub">${esc(n.type[0].toUpperCase() + n.type.slice(1))}</div>` : ''}
              </div>
              <span class="need">${esc(n.pos)}</span>
            </div>`).join('')
            : `<p class="empty">No requirements set.</p>`}
        </section>

        <section class="panel">
          <h2>Squad depth <em>${c.squadSize} tracked</em></h2>
          ${squad.length ? `<div class="bars">${squad.map(([pos, n]) => `
            <div class="bar-row${n === 1 ? ' thin' : ''}">
              <span>${esc(pos)}</span>
              <div class="bar"><i style="width:${Math.round(n / max * 100)}%"></i></div>
              <b>${n}</b>
            </div>`).join('')}</div>`
            : `<p class="empty">No squad data.</p>`}
        </section>
      </div>
    </div>
  </div>`;
}

/* ── Command palette ──────────────────────────────────────────────── */
let palSel = 0, palHits = [];

function openPalette() {
  if ($('.scrim')) return;
  const el = document.createElement('div');
  el.className = 'scrim';
  el.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Search">
      <input id="pal-in" type="text" placeholder="Search clubs, staff, leagues…" autocomplete="off">
      <div class="results" id="pal-out"></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closePalette(); });
  const input = $('#pal-in');
  input.addEventListener('input', () => paintPalette(input.value));
  input.focus();
  paintPalette('');
}

function closePalette() { $('.scrim')?.remove(); }

function search(q) {
  q = q.trim().toLowerCase();
  if (!q) return S.clubs.slice(0, 8).map(c => ({ kind: 'Club', c }));
  const out = [];
  for (const c of S.clubs) {
    if (c.name.toLowerCase().includes(q)) out.push({ kind: 'Club', c });
    if (out.length >= 7) break;
  }
  for (const l of S.leagues) {
    if (out.length >= 10) break;
    if (l.name.toLowerCase().includes(q)) out.push({ kind: 'League', l });
  }
  for (const p of S.people) {
    if (out.length >= 16) break;
    if ((p.n || '').toLowerCase().includes(q)) out.push({ kind: 'Staff', p });
  }
  return out;
}

function paintPalette(q) {
  palHits = search(q); palSel = 0;
  $('#pal-out').innerHTML = palHits.length ? palHits.map((h, i) => {
    if (h.kind === 'Club') return `<div class="result" data-i="${i}" data-sel="${i === 0 ? 1 : 0}">
      ${crestImg(h.c, '')}<div class="r-main"><div class="r-name">${esc(h.c.name)}</div>
      <div class="r-sub">${esc(h.c.lg || '')}</div></div><span class="r-kind">Club</span></div>`;
    if (h.kind === 'League') return `<div class="result" data-i="${i}" data-sel="${i === 0 ? 1 : 0}">
      <div class="r-main"><div class="r-name">${esc(h.l.name)}</div>
      <div class="r-sub">${h.l.clubs.length} clubs</div></div><span class="r-kind">League</span></div>`;
    return `<div class="result" data-i="${i}" data-sel="${i === 0 ? 1 : 0}">
      <div class="r-main"><div class="r-name">${esc(h.p.n)}</div>
      <div class="r-sub">${esc(h.p.r || '')} · ${esc(h.p.club)}</div></div><span class="r-kind">Staff</span></div>`;
  }).join('') : `<p class="empty">Nothing found.</p>`;

  $('#pal-out').querySelectorAll('.result').forEach(r =>
    r.addEventListener('click', () => choose(+r.dataset.i)));
}

function choose(i) {
  const h = palHits[i];
  if (!h) return;
  closePalette();
  if (h.kind === 'Club') go(`#/clubs/${h.c.slug}`);
  else if (h.kind === 'Staff') go(`#/clubs/${h.p.clubSlug}`);
  else { F.league = h.l.name; F.q = ''; go('#/clubs'); setTimeout(paintGrid, 0); }
}

function movePal(d) {
  const rows = $('#pal-out')?.querySelectorAll('.result') || [];
  if (!rows.length) return;
  palSel = (palSel + d + rows.length) % rows.length;
  rows.forEach((r, i) => r.dataset.sel = i === palSel ? 1 : 0);
  rows[palSel].scrollIntoView({ block: 'nearest' });
}

/* ── Theme ────────────────────────────────────────────────────────── */
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('lp-theme'); } catch {}
  if (t) document.documentElement.dataset.theme = t;
  paintThemeBtn();
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('lp-theme', next); } catch {}
  paintThemeBtn();
}

function paintThemeBtn() {
  const dark = (document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const b = $('#theme');
  if (b) { b.innerHTML = svg(dark ? 'sun' : 'moon'); b.title = dark ? 'Light mode' : 'Dark mode'; }
}

/* ── Boot ─────────────────────────────────────────────────────────── */
function chrome() {
  $('.shell').innerHTML = `
    <nav class="rail">
      <div class="brand"><b>LPCMI</b><span>Recruitment</span></div>
      <a class="nav-item" data-route="/clubs" href="#/clubs">${svg('clubs')} Clubs</a>
      <div class="nav-label">Coming next</div>
      <a class="nav-item" href="../index.html">${svg('home')} Old dashboard</a>
      <a class="nav-item" href="../league-tables.html">${svg('trophy')} League tables</a>
      <a class="nav-item" href="../all.html">${svg('players')} Players</a>
      <a class="nav-item" href="../master-database.html">${svg('people')} Staff directory</a>
      <div class="rail-foot" id="rail-foot"></div>
    </nav>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn rail-toggle" id="rail-btn" aria-label="Menu">${svg('menu')}</button>
        <button class="omni" id="omni">${svg('search')} Search clubs, staff, leagues… <kbd>⌘K</kbd></button>
        <button class="icon-btn" id="theme" aria-label="Toggle theme"></button>
      </header>
      <div id="view"></div>
    </div>`;

  $('#omni').addEventListener('click', openPalette);
  $('#theme').addEventListener('click', toggleTheme);
  $('#rail-btn').addEventListener('click', () => {
    const s = $('.shell'); s.dataset.rail = s.dataset.rail === 'open' ? '' : 'open';
  });
  paintThemeBtn();   // the button only exists once the chrome is in the DOM
}

document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (!$('.scrim')) return;
  if (e.key === 'Escape') closePalette();
  else if (e.key === 'ArrowDown') { e.preventDefault(); movePal(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); movePal(-1); }
  else if (e.key === 'Enter') { e.preventDefault(); choose(palSel); }
});

document.addEventListener('input', e => {
  if (e.target.id === 'f-q') { F.q = e.target.value; paintGrid(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'f-league') { F.league = e.target.value; paintGrid(); }
  if (e.target.id === 'f-need') { F.need = e.target.value; paintGrid(); }
});

window.addEventListener('hashchange', () => { render(); if (location.hash.includes('/clubs') && !location.hash.includes('/clubs/')) paintGrid(); });

(async function boot() {
  initTheme();
  chrome();
  $('#view').innerHTML = `<div class="page"><p class="empty">Loading…</p></div>`;
  try {
    const [clubs, leagues, meta] = await Promise.all(
      ['clubs', 'leagues', 'meta'].map(n => fetch(`../data/${n}.json`).then(r => {
        if (!r.ok) throw new Error(`${n}.json ${r.status}`);
        return r.json();
      })));
    S.clubs = clubs; S.leagues = leagues; S.meta = meta;
    // Staff search flattens clubs rather than shipping a duplicate bundle.
    S.people = clubs.flatMap(c => c.staff.map(s => ({ ...s, club: c.name, clubSlug: c.slug })));
    S.ready = true;
    const n = meta.counts;
    $('#rail-foot').innerHTML =
      `<p><b>${n.clubs}</b> clubs · <b>${n.staff.toLocaleString()}</b> staff</p>
       <p><b>${n.players.toLocaleString()}</b> players · <b>${n.leagues}</b> leagues</p>`;
    render();
    paintGrid();
  } catch (err) {
    $('#view').innerHTML = `<div class="page"><p class="empty">Could not load data.<br>${esc(err.message)}</p></div>`;
  }
})();
