/* ═══════════════════════════════════════════════════════════════════
   LPCMI Recruitment — interface v3

   Renders from the JSON bundles written by web/build_data.py. Hash
   routing, so it works as a static file with no server config.
   ═══════════════════════════════════════════════════════════════════ */

const S = { clubs: [], leagues: [], players: [], meta: null, people: [], changes: null,
            expiring: [], outreach: [], careers: {}, clients: [], ready: false };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = x => Number(x || 0).toLocaleString('en-GB');

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
  today: 'M3 4.5h18v16H3zM3 9.5h18M8 2.5v4M16 2.5v4',
  clubs: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  people: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8M4 21c0-4 3.6-7 8-7s8 3 8 7',
  players: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  mine: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  pipe: 'M4 5h5v14H4zM10.5 5h5v9h-5zM17 5h3v6h-3z',
  archive: 'M3 7h18v4H3zM5 11v9h14v-9M10 15h4',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  find: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M20 20l-4.8-4.8M8 10.5h5M10.5 8v5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-4-4',
  sun: 'M12 5V3M12 21v-2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5',
  back: 'M15 18l-6-6 6-6',
  ext: 'M14 5h5v5M19 5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3 2',
  swap: 'M7 9h12l-3-3M17 15H5l3 3',
  arrowIn: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  arrowOut: 'M12 20V9M8 13l4-4 4 4M5 4h14',
  chev: 'M9 6l6 6-6 6',
};
const svg = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name]}"/></svg>`;

const crestImg = (c, cls) => c && c.crest
  ? `<img class="${cls}" src="../${esc(c.crest)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
  : `<span class="${cls}" aria-hidden="true"></span>`;

const initials = s => (s || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const clubBySlug = slug => S.clubs.find(c => c.slug === slug);
const slugOf = nm => (nm || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ── Routing ──────────────────────────────────────────────────────── */
const routes = [
  { re: /^\/clubs\/([^/]+)$/, view: clubPage },
  { re: /^\/clubs$/, view: clubsPage },
  { re: /^\/mine\/([^/]+)$/, view: clientPage },
  { re: /^\/players$/, view: playersPage },
  { re: /^\/mine$/, view: minePage },
  { re: /^\/openings$/, view: openingsPage },
  { re: /^\/pipeline$/, view: pipelinePage },
  { re: /^\/people\/([^/]+)$/, view: personPage },
  { re: /^\/people$/, view: peoplePage },
  { re: /^\/leagues\/([^/]+)$/, view: leaguePage },
  { re: /^\/leagues$/, view: leaguesPage },
  { re: /^\/archive$/, view: archivePage },
  { re: /^\/today$/, view: todayPage },
  { re: /^\/?$/, view: todayPage },
];

function go(hash) { location.hash = hash; }

/* Going back should land where you left, not at the top of a 700-row list.
   Each hash keeps its own scroll offset, saved as you leave it. */
const SCROLL = Object.create(null);
let lastHash = location.hash || '#/';

function rememberScroll() { SCROLL[lastHash] = window.scrollY; }

function restoreScroll(hash) {
  const y = SCROLL[hash];
  if (!y) { window.scrollTo(0, 0); return; }
  // Two frames: one for the new markup, one for images settling into place.
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    requestAnimationFrame(() => window.scrollTo(0, y));
  });
}
window.addEventListener('scroll', () => { SCROLL[location.hash || '#/'] = window.scrollY; },
                        { passive: true });

function render() {
  const path = (location.hash || '#/').slice(1) || '/';
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) {
      $('#view').innerHTML = r.view(...m.slice(1));
      const items = [...document.querySelectorAll('.nav-item[data-route]')];
      items.forEach(el => el.removeAttribute('aria-current'));
      const best = items
        .filter(el => path === el.dataset.route || path.startsWith(el.dataset.route + '/'))
        .sort((a, b) => b.dataset.route.length - a.dataset.route.length)[0];
      if (best) best.setAttribute('aria-current', 'page');
      restoreScroll(location.hash || '#/');
      $('.shell').dataset.rail = '';
      return;
    }
  }
  $('#view').innerHTML = `<div class="page"><p class="empty">Nothing here.</p></div>`;
}

/* ── Shared bits ──────────────────────────────────────────────────── */
function fmtSince(d) {
  if (!d || d.length !== 8) return '';
  const dt = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}
function fmtMonth(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
const EXPKEY = v => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v || ''));
  return m ? +`${m[3]}${m[2]}${m[1]}` : Infinity;
};
const MV = v => {
  const m = /([\d.]+)\s*(m|k|bn)?/i.exec(String(v || ''));
  if (!m) return -1;
  const mult = { bn: 1e9, m: 1e6, k: 1e3 }[(m[2] || '').toLowerCase()] || 1;
  return parseFloat(m[1]) * mult;
};
function zone(c) {
  if (!c.table) return '';
  const total = (S.leagues.find(l => l.name === c.lg)?.table || []).length;
  if (c.table.pos <= 2) return 'up';
  if (total && c.table.pos > total - 3) return 'down';
  return '';
}
// One window everywhere. Changing it here changes the whole app.
const WINDOW = () => (S.meta && S.meta.window) || { label: 'January 2027' };

/* ── Today ────────────────────────────────────────────────────────── */
function changeRow(kind, r) {
  const to = r.toSlug || r.clubSlug;
  const c = clubBySlug(to);
  const sub = kind === 'move'
    ? `${esc(r.r || '')} · <em>${esc(r.from)}</em><span class="arrow">→</span><em>${esc(r.to)}</em>`
    : `${esc(r.r || '')} · <em>${esc(r.club || '')}</em>`;
  const pill = kind === 'in' ? '<span class="pill good">Joined</span>'
    : kind === 'out' ? '<span class="pill bad">Left</span>'
    : '<span class="pill warn">Moved</span>';
  return `<a class="row" href="#/clubs/${esc(to || '')}">
    <i class="bar ${kind === 'move' ? 'mv' : kind}"></i>
    ${c && c.crest ? crestImg(c, 'crest') : `<span class="av">${esc(initials(r.n))}</span>`}
    <div class="who"><b>${esc(r.n)}</b><span>${sub}</span></div>
    ${pill}
  </a>`;
}

// Clubs worth a call: they listed a need, and somebody in the scanned squad at
// that club is running out of contract. The join is the whole point.
const NEED_TO_SCAN = { GK: 'Goalkeeper', RB: 'Right-Back', RWB: 'Right-Back' };

function callList() {
  const out = [];
  for (const c of S.clubs) {
    if (!c.needs.length) continue;
    const codes = new Set(c.needs.map(x => (x.pos || '').toUpperCase()));
    const want = [...codes].map(k => NEED_TO_SCAN[k]).filter(Boolean);
    if (!want.length) continue;
    const hits = S.expiring.filter(p => p.clubSlug === c.slug && want.includes(p.pos));
    if (!hits.length) continue;
    const key = [...c.staff].sort((a, b) => roleRank(a.r) - roleRank(b.r))[0];
    out.push({ c, hits, key: key && isKeyRole(key.r) ? key : null,
               soon: Math.min(...hits.map(h => h.months)) });
  }
  return out.sort((a, b) => a.soon - b.soon || b.hits.length - a.hits.length).slice(0, 12);
}

function todayPage() {
  const ch = S.changes || { moves: [], arrivals: [], departures: [] };
  const since = ch.since ? fmtSince(ch.since) : 'the last scan';
  const total = ch.moves.length + ch.arrivals.length + ch.departures.length;

  // Counted over every expiring contract by the builder, not the 400 shipped.
  const buckets = ((S.meta && S.meta.expiringDates) || []).map(b => ({
    lab: b.d, v: b.n, cls: b.m <= 3 ? 'hot' : b.m <= 6 ? 'warm' : '',
  }));
  const bmax = Math.max(1, ...buckets.map(b => b.v));
  const soonest = buckets.length ? buckets[0] : null;

  const due = S.outreach.filter(isDue);
  const reqs = (S.meta && S.meta.counts.requirements) || 0;
  const reqClubs = S.clubs.filter(c => c.needs.length).length;
  const topNeed = (() => {
    const t = {};
    S.clubs.forEach(c => c.needs.forEach(x => { t[x.pos] = (t[x.pos] || 0) + 1; }));
    const best = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : '—';
  })();

  const rows = [...ch.moves.map(r => ['move', r]), ...ch.departures.map(r => ['out', r]),
                ...ch.arrivals.map(r => ['in', r])];
  const calls = callList();
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return `
  <div class="page">
    <div class="page-head">
      <div><h1>Today</h1><p>${esc(today)} · changes since the ${esc(since)} scan · preparing for ${esc(WINDOW().label)}</p></div>
    </div>

    <div class="kpis">
      <div class="card kpi">
        <span class="eyebrow">Staff changes this week</span><span class="v num">${total}</span>
        <span class="d">
          <span class="pill good">${ch.arrivals.length} in</span>
          <span class="pill bad">${ch.departures.length} out</span>
          <span class="pill warn">${ch.moves.length} moved</span>
        </span>
      </div>
      <div class="card kpi">
        <span class="eyebrow">Expiring within 12 months</span>
        <span class="v num">${n((S.meta && S.meta.counts.expiring) || S.expiring.length)}</span>
        <span class="d">${soonest ? `<b>${n(soonest.v)}</b> of them on ${esc(soonest.lab)}` : ''}</span>
      </div>
      <div class="card kpi">
        <span class="eyebrow">Open requirements</span><span class="v num">${n(reqs)}</span>
        <span class="d">at ${reqClubs} clubs · most wanted <b>${esc(topNeed)}</b></span>
      </div>
      <div class="card kpi">
        <span class="eyebrow">Follow-ups due</span>
        <span class="v num${due.length ? ' bad' : ''}">${due.length}</span>
        <span class="d">of ${S.outreach.length} in the pipeline</span>
      </div>
    </div>

    <div class="g2">
      <section class="card">
        <div class="hd"><h2>Staff movement</h2>
          <span class="pill">${ch.clubsCompared || 0} clubs compared</span></div>
        ${rows.length ? rows.slice(0, 14).map(([k, r]) => changeRow(k, r)).join('')
                      : `<p class="empty">Nothing moved since the last scan.</p>`}
      </section>

      <div class="stack">
        <section class="card">
          <div class="hd"><h2>When contracts end</h2>
            <a class="more" href="#/players">Players ${svg('chev')}</a></div>
          <div class="bars">
            ${buckets.map(b => `<div class="brow">
              <span class="lab">${b.lab}</span>
              <span class="trk"><i class="${b.cls}" style="width:${Math.round(b.v / bmax * 100)}%"></i></span>
              <span class="n num">${n(b.v)}</span></div>`).join('')}
          </div>
        </section>

        <section class="card">
          <div class="hd"><h2>My players</h2><a class="more" href="#/mine">All ${svg('chev')}</a></div>
          ${S.clients.length ? S.clients.map(cl => {
            const top = cl.live;
            return `<a class="row plain" href="#/mine/${esc(cl.slug)}">
              <span class="av">${esc(initials(cl.name))}</span>
              <div class="who"><b>${esc(cl.name)}</b><span>${esc(cl.pos)} · ${esc(cl.club || '')}</span></div>
              <span class="pill acc">${top} club${top === 1 ? '' : 's'} to call</span>
            </a>`;
          }).join('') : `<p class="empty">No clients loaded.</p>`}
        </section>
      </div>
    </div>

    <section class="card">
      <div class="hd"><h2>Clubs to call this week</h2>
        <span class="pill">A listed requirement plus a contract running down in the same position</span></div>
      ${calls.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>Club</th><th>League</th><th>Needs</th><th>Running down there</th><th class="r">Key contact</th></tr></thead>
        <tbody>${calls.map(({ c, hits, key }) => `<tr>
          <td><a class="name" href="#/clubs/${esc(c.slug)}">${crestImg(c, 'crest')}${esc(c.name)}</a></td>
          <td>${esc(c.lg || '')}${c.table ? ` <span class="pill num">${c.table.pos}</span>` : ''}</td>
          <td><span class="needs">${c.needs.slice(0, 4).map(x => `<span class="need">${esc(x.pos)}</span>`).join('')}${c.needs.length > 4 ? `<span class="need">+${c.needs.length - 4}</span>` : ''}</span></td>
          <td class="num">${hits.length} player${hits.length === 1 ? '' : 's'}, soonest ${hits[0].exp ? esc(hits[0].exp) : esc(hits[0].months + ' mo')}</td>
          <td class="r">${key ? `<div class="name stacked">${esc(key.n)}<small>${esc(key.r)}</small></div>`
                               : `<span class="role">No senior contact listed</span>`}</td>
        </tr>`).join('')}</tbody></table></div>`
      : `<p class="empty">Nothing joins up this week. Every club with a requirement has cover in that position.</p>`}
    </section>
  </div>`;
}

/* ── Clubs index ──────────────────────────────────────────────────── */
const F = { q: '', country: '', league: '', need: '', tier: '' };

function clubsPage() {
  const countries = [...new Set(S.clubs.map(c => c.country).filter(Boolean))].sort();
  const leagues = [...new Set(S.clubs
    .filter(c => !F.country || c.country === F.country)
    .map(c => c.lg).filter(Boolean))].sort();
  const needs = [...new Set(S.clubs.flatMap(c => c.needs.map(x => x.pos)))].sort();
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>Clubs</h1><p>Every tracked club, with its staff, requirements and league position in one place.</p></div>
    </div>
    <div class="filters">
      <input class="field" id="f-q" type="search" placeholder="Search clubs…" value="${esc(F.q)}" style="flex:1 1 200px">
      <select class="field" id="f-country"><option value="">All countries</option>
        ${countries.map(x => `<option${x === F.country ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select class="field" id="f-league"><option value="">All leagues</option>
        ${leagues.map(x => `<option${x === F.league ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select class="field" id="f-tier"><option value="">Any English tier</option>
        ${[1,2,3,4,5,6].map(t => `<option value="${t}"${String(t) === F.tier ? ' selected' : ''}>Tier ${t}</option>`).join('')}</select>
      <select class="field" id="f-need"><option value="">Any requirement</option>
        ${needs.map(x => `<option${x === F.need ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      ${(F.q || F.country || F.league || F.need || F.tier) ? `<button class="chip on" id="f-clear">Clear</button>` : ''}
      <span class="count" id="f-count"></span>
    </div>
    <div class="grid" id="club-grid"></div>
  </div>`;
}

function filtered() {
  const q = F.q.trim().toLowerCase();
  return S.clubs.filter(c =>
    (!q || c.name.toLowerCase().includes(q) || (c.lg || '').toLowerCase().includes(q)) &&
    (!F.country || c.country === F.country) &&
    (!F.league || c.lg === F.league) &&
    (!F.tier || String(c.tier || '') === F.tier) &&
    (!F.need || c.needs.some(x => x.pos === F.need)));
}

function clubCard(c) {
  return `<a class="card club-card" href="#/clubs/${esc(c.slug)}"${c.colour ? ` style="--club:${esc(c.colour)}"` : ''}>
    <div class="cc-top">
      ${crestImg(c, 'cc-crest')}
      <div class="cc-id">
        <div class="cc-name">${esc(c.name)}</div>
        <div class="cc-league">${esc(c.lg || '—')}${c.country ? ' · ' + esc(c.country) : ''}</div>
      </div>
      ${c.table ? `<span class="pos-pill ${zone(c)}">${c.table.pos}</span>` : ''}
    </div>
    ${c.needs.length ? `<div class="needs">${c.needs.slice(0, 7).map(x =>
      `<span class="need">${esc(x.pos)}</span>`).join('')}</div>` : ''}
    <div class="cc-meta">
      <span>${c.staff.length} staff</span>
      ${c.squadSize ? `<span>${c.squadSize} tracked</span>` : ''}
      ${c.outreach ? `<span>${c.outreach} contacted</span>` : ''}
    </div>
  </a>`;
}

function paintGrid() {
  const grid = $('#club-grid');
  if (!grid) return;
  const list = filtered();
  grid.innerHTML = list.length ? list.map(clubCard).join('')
                               : `<p class="empty">No clubs match those filters.</p>`;
  const cnt = $('#f-count');
  if (cnt) cnt.textContent = `${n(list.length)} of ${n(S.clubs.length)}`;
}

/* ── Pitch map ────────────────────────────────────────────────────── */
/* A requirement list is hard to read; a pitch is not. Coordinates are the
   position's home on a 4-2-3-1, in percentages of the pitch box. */
const PITCH = {
  GK:  [50, 89, 'GK'],  CB:  [50, 78, 'CB'],  'CB-L': [36, 78, 'CB'], 'CB-R': [64, 78, 'CB'],
  LB:  [17, 73, 'LB'],  RB:  [83, 73, 'RB'],  'WB-L': [15, 64, 'WB'], 'WB-R': [85, 64, 'WB'],
  RFB: [83, 73, 'RB'],
  DM:  [50, 60, 'DM'],  CM:  [33, 47, 'CM'],  AM: [50, 36, 'AM'],
  LW:  [17, 33, 'LW'],  RW:  [83, 33, 'RW'],  W: [78, 42, 'W'],
  ST:  [50, 17, 'ST'],  CF:  [50, 17, 'CF'],
};
// Codes in the data carry qualifiers ("CM #8", "GK 04+", "#9 CF").
function pitchKey(code) {
  const raw = (code || '').toUpperCase().trim();
  if (PITCH[raw]) return raw;
  const cleaned = raw.replace(/#\d+|\d{2}\+|\//g, ' ').trim();
  if (PITCH[cleaned]) return cleaned;
  for (const k of ['CB-L', 'CB-R', 'WB-L', 'WB-R', 'GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST', 'CF', 'W'])
    if (cleaned.split(/\s+/).includes(k)) return k;
  return null;
}

function pitchMap(needs) {
  const wanted = new Map();
  needs.forEach(x => { const k = pitchKey(x.pos); if (k) wanted.set(k, x); });
  const base = ['GK', 'LB', 'CB-L', 'CB-R', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
  const keys = [...new Set([...base, ...wanted.keys()])];
  return `<div class="pitch" role="img" aria-label="Pitch showing the positions this club is recruiting">
    <svg viewBox="0 0 68 105" preserveAspectRatio="none">
      <rect x="0.5" y="0.5" width="67" height="104"/>
      <line x1="0" y1="52.5" x2="68" y2="52.5"/>
      <circle cx="34" cy="52.5" r="9.15"/>
      <rect x="13.84" y="0.5" width="40.32" height="16.5"/>
      <rect x="24.84" y="0.5" width="18.32" height="5.5"/>
      <rect x="13.84" y="88" width="40.32" height="16.5"/>
      <rect x="24.84" y="99" width="18.32" height="5.5"/>
    </svg>
    ${keys.map(k => {
      const p = PITCH[k]; if (!p) return '';
      const on = wanted.has(k);
      return `<span class="pos${on ? ' need' : ''}" style="left:${p[0]}%;top:${p[1]}%"
        title="${esc(on ? (wanted.get(k).label || k) : k)}">${esc(p[2])}</span>`;
    }).join('')}
  </div>`;
}

/* ── Club page ────────────────────────────────────────────────────── */
function clubPage(slug) {
  const c = clubBySlug(decodeURIComponent(slug));
  if (!c) return `<div class="page"><p class="empty">Club not found.</p></div>`;

  const staff = [...c.staff].sort((a, b) =>
    roleRank(a.r) - roleRank(b.r) || (a.n || '').localeCompare(b.n || ''));
  const ORDER = [
    ['recruitment', 'Recruitment'], ['manager', 'Manager'], ['scouting', 'Scouting'],
    ['board', 'Board'], ['coaching', 'Coaching and support'], ['other', 'Everyone else'],
  ];
  const grouped = ORDER
    .map(([k, label]) => [label, staff.filter(s => (s.g || 'other') === k)])
    .filter(([, rows]) => rows.length);

  const squad = Object.entries(c.squad).sort((a, b) => b[1] - a[1]);
  const smax = Math.max(1, ...squad.map(s => s[1]));
  const t = c.table;
  const exp = S.expiring.filter(p => p.clubSlug === c.slug);
  const byType = {};
  c.needs.forEach(x => { byType[x.type || 'other'] = (byType[x.type || 'other'] || 0) + 1; });
  const lead = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

  return `
  <div class="page">
    <a class="back" href="#/clubs">${svg('back')} All clubs</a>

    <div class="card chead"${c.colour ? ` style="--club:${esc(c.colour)}"` : ''}>
      ${crestImg(c, 'crest lg')}
      <div>
        <h1>${esc(c.name)}</h1>
        <div class="meta">
          <span class="pill">${esc(c.lg || 'League unknown')}</span>
          ${c.country ? `<span>${esc(c.country)}</span>` : ''}
          <span>${c.staff.length} staff</span>
          <span>${c.needs.length} requirement${c.needs.length === 1 ? '' : 's'}</span>
          ${c.outreach ? `<span class="pill acc">${c.outreach} in pipeline</span>` : ''}
        </div>
      </div>
      <div class="actions">
        ${c.tm ? `<a class="btn" href="${esc(c.tm)}" target="_blank" rel="noopener">${svg('ext')} Transfermarkt</a>` : ''}
        ${c.staffUrl ? `<a class="btn" href="${esc(c.staffUrl)}" target="_blank" rel="noopener">${svg('ext')} Staff page</a>` : ''}
      </div>
    </div>

    <div class="g3">
      <div class="card stat">
        <div class="eyebrow">League position</div>
        <div class="v num">${t ? t.pos : '—'}${t ? `<small>${t.pts ?? '—'} pts from ${t.p ?? '—'}</small>` : ''}</div>
        ${t ? `<div class="sub">W${t.w ?? '—'} D${t.d ?? '—'} L${t.l ?? '—'} · GD ${t.gd ?? '—'}</div>`
            : `<div class="sub">No table for this league.</div>`}
      </div>
      <div class="card stat">
        <div class="eyebrow">Squad scanned</div>
        <div class="v num">${c.squadSize}${squad.length ? `<small>${squad.map(s => s[0].replace('Goalkeeper', 'GK').replace('Right-Back', 'RB') + ' ' + s[1]).join(' · ')}</small>` : ''}</div>
        <div class="sub">The squad scan covers goalkeepers and right-backs only.</div>
      </div>
      <div class="card stat">
        <div class="eyebrow">Contracts running down</div>
        <div class="v num">${exp.length}</div>
        <div class="sub">${exp.length ? esc(exp.slice(0, 2).map(p => `${p.n} (${p.exp})`).join(' · ')) : 'Nobody tracked here is inside 12 months.'}</div>
      </div>
    </div>

    ${c.needs.length ? `
    <section class="card" style="margin-bottom:16px">
      <div class="hd"><h2>Where they need players</h2>
        <span class="pill">${c.needs.length} position${c.needs.length === 1 ? '' : 's'}${lead ? ` · ${esc(lead[0])} heavy` : ''}</span></div>
      <div class="pitchonly">
        ${pitchMap(c.needs)}
        <div class="pitchkey">
          <p>Every position on a 4-2-3-1. The white markers are what ${esc(c.name)} is recruiting.</p>
          <div class="keyrow"><span class="pos need" style="position:static;transform:none">POS</span> Wanted</div>
          <div class="keyrow"><span class="pos" style="position:static;transform:none">POS</span> Covered, or not listed</div>
        </div>
      </div>
    </section>

    <section class="card" style="margin-bottom:16px">
      <div class="hd"><h2>The requirement list</h2>
        <span class="pill">${esc(WINDOW().label)} window</span></div>
      <div class="needgrid">
        ${c.needs.map(x => {
          const scan = NEED_TO_SCAN[(x.pos || '').toUpperCase()];
          const have = scan ? (c.squad[scan] || 0) : null;
          return `<div class="needrow">
            <span class="tag">${esc(x.pos)}</span>
            <div><b>${esc(x.label || x.pos)}</b>
              <small>${esc((x.detail || []).join(' · ') || (x.type ? x.type[0].toUpperCase() + x.type.slice(1) : ''))}</small></div>
            <span class="sq">${have === null ? '' : `in squad <b>${have}</b>`}</span>
          </div>`;
        }).join('')}
      </div>
    </section>`
    : `<section class="card" style="margin-bottom:16px">
        <div class="hd"><h2>What they are looking for</h2></div>
        <p class="empty">No requirements recorded for this club.</p></section>`}

    <div class="g2">
      <section class="card">
        <div class="hd"><h2>Staff</h2><span class="pill">${c.staff.length}</span></div>
        ${grouped.length ? `<div class="table-wrap"><table class="tbl"><tbody>
          ${grouped.map(([label, rows]) => `<tr class="group"><td colspan="4">${esc(label)} · ${rows.length}</td></tr>
            ${rows.map(s => `<tr>
              <td><a class="name" href="#/people/${esc(slugOf(s.n))}">${esc(s.n)}</a></td>
              <td>${esc(s.r || '—')}</td>
              <td>${esc(s.nat || '')}</td>
              <td class="r">${s.tm ? `<a class="ext" href="${esc(s.tm)}" target="_blank" rel="noopener"
                   aria-label="Transfermarkt profile for ${esc(s.n)}">${svg('ext')}</a>` : ''}</td>
            </tr>`).join('')}`).join('')}
        </tbody></table></div>` : `<p class="empty">No staff recorded.</p>`}
      </section>

      <section class="card">
        <div class="hd"><h2>Squad depth</h2><span class="pill">${c.squadSize} tracked</span></div>
        ${squad.length ? `<div class="depth">${squad.map(([pos, v]) => `
          <div class="bar-row${v <= 1 ? ' thin' : ''}">
            <span>${esc(pos)}</span>
            <span class="bar"><i style="width:${Math.round(v / smax * 100)}%"></i></span>
            <b class="num">${v}</b>
          </div>`).join('')}</div>` : `<p class="empty">No squad data for this club.</p>`}
      </section>
    </div>
  </div>`;
}

/* ── My players ───────────────────────────────────────────────────── */
function minePage() {
  if (!S.clients.length) return `<div class="page"><p class="empty">No clients loaded.</p></div>`;
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>My players</h1><p>Each one with the clubs worth calling for ${esc(WINDOW().label)}, ranked on what the scan actually shows.</p></div>
    </div>
    <div class="clients">
      ${S.clients.map(cl => {
        const live = cl.live;
        return `<a class="card client" href="#/mine/${esc(cl.slug)}">
          <div class="top">
            <span class="av">${esc(initials(cl.name))}</span>
            <div><div class="nm">${esc(cl.name)}</div>
              <div class="sb">${esc(cl.pos)} · ${esc(cl.club || '')}</div></div>
          </div>
          <div class="facts">
            ${cl.age ? `<span class="pill">${esc(cl.age)}</span>` : ''}
            ${cl.height ? `<span class="pill">${esc(cl.height)}</span>` : ''}
            ${cl.foot ? `<span class="pill">${esc(cl.foot)} footed</span>` : ''}
            ${cl.deal ? `<span class="pill acc">${esc(cl.deal)}</span>` : ''}
          </div>
          <div class="sb">${live} of ${cl.candidates.length} clubs at loan level are worth a call.</div>
          <span class="cta">Open his list ${svg('chev')}</span>
        </a>`;
      }).join('')}
    </div>
  </div>`;
}

// Default to the clubs with a reason. A list that opens on 60 rows of "nothing
// in the data points here" buries the seven that matter.
const MINE = { shown: 25, only: true };

function clientPage(slug) {
  const cl = S.clients.find(c => c.slug === decodeURIComponent(slug));
  if (!cl) return `<div class="page"><p class="empty">No such player.</p></div>`;
  const floor = cl.floor || (cl.scanned ? 50 : 25);
  const live = cl.candidates.filter(x => x.score >= floor);
  const list = (MINE.only ? live : cl.candidates).slice(0, MINE.shown);
  const smax = Math.max(1, ...cl.candidates.map(x => x.score));
  const prior = S.outreach.filter(o => o.player === cl.name);
  const tm = cl.tmProfile;

  return `
  <div class="page">
    <a class="back" href="#/mine">${svg('back')} My players</a>

    <div class="card chead">
      <span class="av" style="width:56px;height:56px;font-size:18px">${esc(initials(cl.name))}</span>
      <div>
        <h1>${esc(cl.name)}</h1>
        <div class="meta">
          <span class="pill acc">${esc(cl.pos)}</span>
          <span>${esc(cl.club || '')}</span>
          ${cl.age ? `<span>${esc(cl.age)} years old</span>` : ''}
          ${cl.height ? `<span>${esc(cl.height)}</span>` : ''}
          ${cl.foot ? `<span>${esc(cl.foot)} footed</span>` : ''}
          ${cl.nat ? `<span>${esc(cl.nat)}</span>` : ''}
          ${cl.tm ? `<a href="${esc(cl.tm)}" target="_blank" rel="noopener">Transfermarkt ${svg('ext')}</a>` : ''}
        </div>
      </div>
    </div>

    <div class="g3">
      <div class="card stat"><div class="eyebrow">Contract</div>
        <div class="v">${esc((tm && tm.exp && tm.exp !== '-' ? tm.exp : cl.exp) || 'None listed')}</div>
        <div class="sub">${esc(tm && tm.exp && tm.exp !== '-' ? 'Per Transfermarkt' : (cl.expNote || ''))}</div></div>
      <div class="card stat"><div class="eyebrow">Worth a call now</div>
        <div class="v num">${live.length}<small>of ${cl.candidates.length} at loan level</small></div>
        <div class="sub">Scoring ${cl.floor}+ out of 100. Tiers 4 to 6: League Two, National League, North and South.</div></div>
      <div class="card stat"><div class="eyebrow">Already contacted</div>
        <div class="v num">${prior.length}</div>
        <div class="sub">${prior.length ? esc([...new Set(prior.map(p => p.club))].join(' · ')) : 'Nothing logged for him yet.'}</div></div>
    </div>

    ${tm ? `<section class="card" style="margin-bottom:16px">
      <div class="hd"><h2>Player data</h2>
        <span class="pill">Transfermarkt, read ${esc(tm.fetched || '')}</span>
        ${cl.tm ? `<a class="more" href="${esc(cl.tm)}" target="_blank" rel="noopener">Profile ${svg('ext')}</a>` : ''}</div>
      <div class="factgrid">
        ${fact('Date of birth', tm.dob)}
        ${fact('Born', tm.birthplace)}
        ${fact('Height', heightNote(tm.height, cl.height))}
        ${fact('Foot', tm.foot)}
        ${fact('Position', tm.pos)}
        ${fact('Club', tm.club)}
        ${fact('Joined', tm.joined)}
        ${fact('Contract', tm.exp && tm.exp !== '-' ? tm.exp : 'None listed')}
        ${fact('Market value', tm.mv)}
        ${fact('Youth clubs', tm.youth)}
        ${fact('Agent', tm.agent)}
      </div>
      ${tm.thin ? `<div class="howto" style="padding-top:0"><p class="count">Transfermarkt carries no appearance or transfer history for him yet, which is normal for an academy player. The season numbers below come from his own CV.</p></div>` : ''}
    </section>` : ''}

    ${(cl.cvProfile || cl.cvSeason || (cl.traits || []).length) ? `<section class="card" style="margin-bottom:16px">
      <div class="hd"><h2>The pitch</h2><span class="pill">From his LPCMI CV</span></div>
      <div class="howto">
        ${cl.cvProfile ? `<p>${esc(cl.cvProfile)}</p>` : ''}
        ${(cl.traits || []).length ? `<div class="facts" style="margin:10px 0">${cl.traits.map(t => `<span class="pill acc">${esc(t)}</span>`).join('')}</div>` : ''}
        ${cl.cvSeason ? `<div class="kpis" style="margin:12px 0 0">
          ${[['Appearances', cl.cvSeason.apps], ['Goals', cl.cvSeason.goals],
             ['Assists', cl.cvSeason.assists], ['Minutes', cl.cvSeason.minutes]]
            .map(([k, v]) => `<div class="card kpi"><span class="eyebrow">${esc(k)}</span><span class="v num">${n(v)}</span>
              <span class="d">${esc(cl.cvSeason.label || '')}</span></div>`).join('')}
        </div>` : ''}
        ${(cl.previous || []).length ? `<p class="count" style="margin-top:12px">Previously: ${cl.previous.map(esc).join(' · ')}</p>` : ''}
      </div>
    </section>` : ''}

    ${cl.notes ? `<div class="callout info">${esc(cl.notes)}</div>` : ''}
    ${cl.scanned
      ? `<div class="callout">Scored out of 100 for a loan <b>this January</b>, not next summer. Thin cover carries the score: one senior option in his position is worth 55, two is 35, leaning on a loanee who could be recalled adds 20, and the club saying it wants one adds 25. A contract running down is only worth 6, because it pays off in June.</div>`
      : `<div class="callout"><b>Scoring is partial for this position.</b> The squad scan covers goalkeepers and right-backs only, so midfield depth and contracts cannot be read. Ranking below uses each club's published requirement list alone, which is why the ceiling is 30.</div>`}

    <section class="card">
      <div class="hd"><h2>Clubs to approach</h2>
        <button class="chip${MINE.only ? ' on' : ''}" id="mine-only">Only the ones worth a call</button>
        <span class="count">${n(list.length)} of ${n(cl.candidates.length)}</span></div>

      <div class="approach">
        ${list.map(x => {
          const c = clubBySlug(x.slug);
          const top = x.why.filter(w => w.k !== 'info').slice(0, 3);
          const note = x.why.find(w => w.k === 'info');
          return `<article class="ap">
            <a class="ap-club" href="#/clubs/${esc(x.slug)}">
              ${c ? crestImg(c, 'crest') : ''}
              <span><b>${esc(x.name)}</b><small>${esc(x.lg)}${x.pos ? ` · ${x.pos}${ordinal(x.pos)}` : ''}</small></span>
            </a>

            <div class="ap-fit">
              <div class="meter" style="--w:${x.score}%" aria-hidden="true"></div>
              <span class="num"><b>${x.score}</b>/100</span>
            </div>

            <div class="ap-why">
              ${top.length ? top.map(w => `<div class="wr w-${esc(w.k)}">
                  <b>${esc(w.t)}</b>${w.d ? `<span>${esc(w.d)}</span>` : ''}
                </div>`).join('')
                : `<div class="wr w-info"><b>${esc(note ? note.t : 'Nothing in the data points here')}</b></div>`}
              ${x.depth !== null && x.squad.length ? `<div class="wr w-squad">
                <b>In the squad</b><span>${x.squad.map(p =>
                  `${esc(p.n)} (${esc(p.age || '?')})${p.loan ? ', on loan' : ''}`).join(' · ')}</span></div>` : ''}
            </div>

            <div class="ap-who">
              ${x.contact ? `<b>${esc(x.contact.n)}</b><small>${esc(x.contact.r)}</small>`
                          : `<span class="role">No senior contact listed</span>`}
              ${x.reached ? `<span class="pill acc">Contacted</span>` : ''}
            </div>
          </article>`;
        }).join('') || `<p class="empty">Nothing matches. Turn the filter off to see every club at loan level.</p>`}
      </div>
      ${((MINE.only ? live : cl.candidates).length > MINE.shown)
        ? `<button class="more" id="mine-more">Show more</button>` : ''}
    </section>

    ${cl.summer2026 && cl.summer2026.length ? `<p class="count" style="margin-top:14px">
      His ${cl.summer2026.length}-club Summer 2026 shortlist is in <a href="#/archive" style="color:var(--acc);font-weight:600">Archive</a>.</p>` : ''}
  </div>`;
}

/* Transfermarkt and a player's own CV can disagree, and a sporting director
   will notice. Show both rather than silently picking one. */
function heightNote(tmH, cvH) {
  if (!tmH) return cvH || '';
  const ft = /(\d+)\s*ft\s*(\d+)/.exec(tmH);
  const cm = ft ? Math.round((+ft[1] * 12 + +ft[2]) * 2.54) : null;
  const cvCm = cvH ? Math.round(parseFloat(cvH) * 100) : null;
  if (cm && cvCm && Math.abs(cm - cvCm) > 4) return `${tmH} — his CV says ${cvH}`;
  return tmH;
}

const ordinal = v => {
  const x = +v;
  if (!x) return '';
  if (x % 100 >= 11 && x % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][x % 10] || 'th';
};

function fact(label, value) {
  if (!value) return '';
  return `<div class="fact"><span class="eyebrow">${esc(label)}</span><b>${esc(value)}</b></div>`;
}

/* ── Find a club ──────────────────────────────────────────────────── */
/* The question the job actually starts from: who is short in this position,
   right now. Everything else on the site answers it sideways. */

const OPEN = { pos: 'Goalkeeper', max: 2, country: 'England', tier: '', needOnly: false, shown: 40 };

function scannedPositions() {
  return [...new Set(S.players.map(p => p.pos).filter(Boolean))].sort();
}

function openingsRows() {
  const byClub = new Map();
  for (const p of S.players) {
    if (p.pos !== OPEN.pos) continue;
    if (!byClub.has(p.clubSlug)) byClub.set(p.clubSlug, []);
    byClub.get(p.clubSlug).push(p);
  }
  const slot = SLOT_OF[OPEN.pos];
  const rows = [];
  for (const c of S.clubs) {
    if (!c.squadSize) continue;                       // never scanned, not an opening
    if (OPEN.country && c.country !== OPEN.country) continue;
    if (OPEN.tier && String(c.tier || '') !== OPEN.tier) continue;
    const group = byClub.get(c.slug) || [];
    if (group.length > OPEN.max) continue;
    const listed = slot ? c.needs.some(x => x.pos === slot) : false;
    if (OPEN.needOnly && !listed) continue;
    const loans = group.filter(p => /on loan/i.test(p.status || ''));
    const soon = group.filter(p => EXPKEY(p.exp) <= 20270701);
    const key = [...c.staff].sort((a, b) => roleRank(a.r) - roleRank(b.r))[0];
    rows.push({ c, group, listed, loans, soon, key: key && isKeyRole(key.r) ? key : null });
  }
  return rows.sort((a, b) =>
    a.group.length - b.group.length
    || (b.listed - a.listed)
    || (b.loans.length - a.loans.length)
    || a.c.name.localeCompare(b.c.name));
}

// Squad-scan labels to the eleven shirts, so "does the club say it wants one"
// can be answered from the requirement list.
const SLOT_OF = { 'Goalkeeper': 'GK', 'Right-Back': 'RB' };

function openingsPage() {
  const positions = scannedPositions();
  const countries = [...new Set(S.clubs.map(c => c.country).filter(Boolean))].sort();
  const rows = openingsRows();
  const clients = S.clients.filter(cl => cl.scanPos === OPEN.pos);

  return `
  <div class="page">
    <div class="page-head">
      <div><h1>Find a club</h1>
        <p>Clubs carrying ${OPEN.max === 1 ? 'a single' : 'no more than ' + OPEN.max} ${esc(OPEN.pos.toLowerCase())}${OPEN.max === 1 ? '' : 's'} in the last squad scan. Thin cover now is the reason to ring now.</p></div>
    </div>

    <div class="filters">
      <select class="field" id="op-pos">
        ${positions.map(x => `<option${x === OPEN.pos ? ' selected' : ''}>${esc(x)}</option>`).join('')}
      </select>
      <select class="field" id="op-max">
        ${[1, 2, 3].map(v => `<option value="${v}"${v === OPEN.max ? ' selected' : ''}>${v} or fewer</option>`).join('')}
      </select>
      <select class="field" id="op-country"><option value="">Every country</option>
        ${countries.map(x => `<option${x === OPEN.country ? ' selected' : ''}>${esc(x)}</option>`).join('')}
      </select>
      <select class="field" id="op-tier"><option value="">Any English tier</option>
        ${[1,2,3,4,5,6].map(t => `<option value="${t}"${String(t) === OPEN.tier ? ' selected' : ''}>Tier ${t}</option>`).join('')}
      </select>
      <button class="chip${OPEN.needOnly ? ' on' : ''}" id="op-need">Only clubs that asked for one</button>
      <span class="count">${n(rows.length)} clubs</span>
    </div>

    ${clients.length ? `<div class="callout info">
      ${clients.map(cl => `<b>${esc(cl.name)}</b> plays here. <a href="#/mine/${esc(cl.slug)}" style="color:var(--carmin);font-weight:600">Open his ranked list</a>`).join(' · ')}
    </div>` : ''}

    ${S.players.some(p => p.pos === OPEN.pos) ? '' : `<div class="callout">
      The squad scan covers goalkeepers and right-backs only, so there is no depth data for ${esc(OPEN.pos.toLowerCase())}s yet.</div>`}

    <section class="card">
      <div class="table-wrap"><table class="tbl">
        <thead><tr>
          <th>Club</th><th>League</th><th class="r">In squad</th>
          <th>Who they have</th><th class="r">Asked for one</th><th class="r">Key contact</th>
        </tr></thead>
        <tbody>${rows.slice(0, OPEN.shown).map(r => `<tr>
          <td><a class="name" href="#/clubs/${esc(r.c.slug)}">${crestImg(r.c, 'crest')}${esc(r.c.name)}</a></td>
          <td>${esc(r.c.lg || '')}${r.c.table ? ` <span class="pill num">${r.c.table.pos}</span>` : ''}</td>
          <td class="r"><span class="pill ${r.group.length <= 1 ? 'bad' : 'warn'}">${r.group.length}</span></td>
          <td>${r.group.length ? r.group.map(p =>
            `<div class="who"><b>${esc(p.n)}</b><span>${esc(p.age || '?')} · ${esc(p.exp || 'no contract date')}${
              /on loan/i.test(p.status || '') ? ' · <em>on loan</em>' : ''}</span></div>`).join('')
            : '<span class="role">Nobody in the scan</span>'}</td>
          <td class="r">${r.listed ? '<span class="pill good">Yes</span>' : '<span class="role">—</span>'}</td>
          <td class="r">${r.key ? `<div class="name stacked">${esc(r.key.n)}<small>${esc(r.key.r)}</small></div>`
                                : '<span class="role">—</span>'}</td>
        </tr>`).join('') || `<tr><td colspan="6"><p class="empty">No club matches. Widen the filters.</p></td></tr>`}
        </tbody>
      </table></div>
      ${rows.length > OPEN.shown ? `<button class="more" id="op-more">Show more (${n(rows.length - OPEN.shown)} left)</button>` : ''}
    </section>
  </div>`;
}

/* ── Players ──────────────────────────────────────────────────────── */
/* 3,381 rows. The old page rendered every one into the markup, which is how
   all.html reached 192,099 DOM nodes. This renders a window and grows it. */
const P = { q: '', league: '', pos: '', status: '', sort: 'n', dir: 1, shown: 60 };
const PAGE = 60;

const COLS = [
  { k: 'n',   label: 'Player',   get: p => p.n },
  { k: 'club',label: 'Club',     get: p => p.club },
  { k: 'pos', label: 'Position', get: p => p.pos },
  { k: 'age', label: 'Age',      get: p => +p.age || 0, num: true },
  { k: 'nat', label: 'Nationality', get: p => p.nat },
  { k: 'exp', label: 'Contract', get: p => EXPKEY(p.exp), num: true },
  { k: 'mv',  label: 'Value',    get: p => MV(p.mv), num: true },
];

function playersPage() {
  const leagues = [...new Set(S.players.map(p => p.lg).filter(Boolean))].sort();
  const poss = [...new Set(S.players.map(p => p.pos).filter(Boolean))].sort();
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>Players</h1><p>Every tracked player. Sort any column; the list loads as you scroll.</p></div>
      <div class="actions"><a class="btn pri" href="#/mine">${svg('mine')} My players</a></div>
    </div>

    <div class="clients">
      ${S.clients.map(cl => {
        const live = cl.live;
        return `<a class="card client" href="#/mine/${esc(cl.slug)}">
          <div class="top"><span class="av">${esc(initials(cl.name))}</span>
            <div><div class="nm">${esc(cl.name)}</div><div class="sb">${esc(cl.pos)} · ${esc(cl.club || '')}</div></div></div>
          <div class="sb">${live} club${live === 1 ? '' : 's'} worth calling for ${esc(WINDOW().label)}.</div>
          <span class="cta">Open his list ${svg('chev')}</span>
        </a>`;
      }).join('')}
    </div>

    <div class="filters">
      <input class="field" id="p-q" type="search" placeholder="Search player or club…" value="${esc(P.q)}" style="flex:1 1 200px">
      <select class="field" id="p-league"><option value="">All leagues</option>
        ${leagues.map(l => `<option${l === P.league ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="p-pos"><option value="">All positions</option>
        ${poss.map(l => `<option${l === P.pos ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select class="field" id="p-status">
        <option value="">Any contract</option>
        <option value="expiring"${P.status === 'expiring' ? ' selected' : ''}>Expiring within a year</option>
        <option value="loan"${P.status === 'loan' ? ' selected' : ''}>On loan</option>
      </select>
      <span class="count" id="p-count"></span>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr>${COLS.map(c =>
            `<th data-sort="${c.k}" class="${P.sort === c.k ? 'on' : ''}" tabindex="0" role="button">
               ${esc(c.label)}<i>${P.sort === c.k ? (P.dir > 0 ? '▴' : '▾') : ''}</i></th>`).join('')}
          </tr></thead>
          <tbody id="p-body"></tbody>
        </table>
      </div>
    </div>
    <div id="p-more"></div>
  </div>`;
}

function playersFiltered() {
  const q = P.q.trim().toLowerCase();
  const list = S.players.filter(p =>
    (!q || (p.n || '').toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q)) &&
    (!P.league || p.lg === P.league) &&
    (!P.pos || p.pos === P.pos) &&
    (P.status !== 'loan' || /on loan/i.test(p.status || '')) &&
    (P.status !== 'expiring' || EXPKEY(p.exp) <= 20270913));
  const col = COLS.find(c => c.k === P.sort) || COLS[0];
  return list.sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    return (col.num ? x - y : String(x || '').localeCompare(String(y || ''))) * P.dir;
  });
}

function paintPlayers(reset) {
  const body = $('#p-body');
  if (!body) return;
  if (reset) P.shown = PAGE;
  const list = playersFiltered();
  body.innerHTML = list.slice(0, P.shown).map(p => {
    const soon = EXPKEY(p.exp) <= 20270913;
    const loan = /on loan/i.test(p.status || '');
    return `<tr>
      <td><a href="${esc(p.tm || '#')}" target="_blank" rel="noopener">${esc(p.n)}</a>
        ${loan ? '<span class="pill">Loan</span>' : ''}</td>
      <td><a href="#/clubs/${esc(p.clubSlug)}">${esc(p.club || '')}</a></td>
      <td>${esc(p.pos || '')}</td>
      <td class="num">${esc(p.age || '')}</td>
      <td>${esc(p.nat || '')}</td>
      <td class="num${soon ? ' hot' : ''}">${esc(p.exp || '')}</td>
      <td class="num">${esc(p.mv || '')}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7"><p class="empty">Nobody matches.</p></td></tr>`;
  $('#p-count').textContent = `${n(list.length)} of ${n(S.players.length)}`;
  $('#p-more').innerHTML = list.length > P.shown
    ? `<button class="more" id="p-more-btn">Show more (${n(list.length - P.shown)} left)</button>` : '';
  const btn = $('#p-more-btn');
  if (btn) btn.addEventListener('click', () => { P.shown += PAGE * 4; paintPlayers(); });
}

/* ── People ───────────────────────────────────────────────────────── */
const PF = { q: '', role: '', movers: false, shown: 60 };
/* The groups a recruiter actually thinks in. The builder tags every staff
   member with one of these, so the filter is a lookup rather than a regex
   race where "Assistant Manager" wins the Manager bucket. */
const GROUPS = [
  ['recruitment', 'Recruitment', 'Sporting directors, directors of football, heads of recruitment'],
  ['scouting', 'Scouting', 'Chief scouts, heads of scouting, first-team scouts'],
  ['manager', 'Managers only', 'The manager or head coach, nobody else'],
  ['coaching', 'Coaching staff', 'Assistants, coaches, analysts, medical'],
  ['board', 'Board', 'Owners, presidents, chief executives'],
];

function peoplePage() {
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>People</h1><p>Every tracked staff member. ${n(Object.keys(S.careers).length)} have a career history across the scan snapshots.</p></div>
    </div>
    <div class="filters">
      <input class="field" id="pe-q" type="search" placeholder="Search name, club or role…" value="${esc(PF.q)}" style="flex:1 1 240px">
      <select class="field" id="pe-role">
        <option value="">All roles</option>
        ${GROUPS.map(([k, label]) => `<option value="${k}"${PF.role === k ? ' selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
      <button class="chip${PF.movers ? ' on' : ''}" id="pe-movers">Moved club</button>
      <span class="count" id="pe-count"></span>
    </div>
    <div class="card" id="pe-list"></div>
    <div id="pe-more"></div>
  </div>`;
}

function peopleFiltered() {
  const q = PF.q.trim().toLowerCase();
  return S.people.filter(p => {
    if (PF.movers) {
      const c = S.careers[slugOf(p.n)];
      if (!c || new Set(c.spells.map(s => s.clubSlug)).size < 2) return false;
    }
    if (PF.role && p.g !== PF.role) return false;
    if (!q) return true;
    return (p.n || '').toLowerCase().includes(q)
        || (p.club || '').toLowerCase().includes(q)
        || (p.r || '').toLowerCase().includes(q);
  });
}

function paintPeople(reset) {
  const host = $('#pe-list');
  if (!host) return;
  if (reset) PF.shown = 60;
  const list = peopleFiltered();
  host.innerHTML = list.slice(0, PF.shown).map(p => {
    const c = clubBySlug(p.clubSlug);
    const car = S.careers[slugOf(p.n)];
    const moves = car ? new Set(car.spells.map(s => s.clubSlug)).size - 1 : 0;
    return `<a class="row plain" href="#/people/${esc(slugOf(p.n))}">
      ${c && c.crest ? crestImg(c, 'crest') : `<span class="av">${esc(initials(p.n))}</span>`}
      <div class="who"><b>${esc(p.n)}</b><span>${esc(p.club || '')}${p.nat ? ' · ' + esc(p.nat) : ''}</span></div>
      <span>${moves > 0 ? `<span class="pill warn">${moves} club${moves === 1 ? '' : 's'}</span> ` : ''}
        <span class="role${isKeyRole(p.r) ? ' key' : ''}">${esc(p.r || '—')}</span></span>
    </a>`;
  }).join('') || `<p class="empty">Nobody matches.</p>`;
  $('#pe-count').textContent = `${n(list.length)} of ${n(S.people.length)}`;
  $('#pe-more').innerHTML = list.length > PF.shown
    ? `<button class="more" id="pe-more-btn">Show more (${n(list.length - PF.shown)} left)</button>` : '';
  const b = $('#pe-more-btn');
  if (b) b.addEventListener('click', () => { PF.shown += 240; paintPeople(); });
}

function personPage(slug) {
  slug = decodeURIComponent(slug);
  const cur = S.people.find(p => slugOf(p.n) === slug);
  const car = S.careers[slug];
  if (!cur && !car) return `<div class="page"><p class="empty">Nobody by that name.</p></div>`;

  const name = cur ? cur.n : car.name;
  const nat = (cur && cur.nat) || (car && car.nat) || '';
  const tm = (cur && cur.tm) || (car && car.tm) || '';
  const club = cur ? clubBySlug(cur.clubSlug) : null;

  // Newest first: where are they now, then how they got here.
  const spells = car ? [...car.spells].reverse()
    : (cur ? [{ club: cur.club, clubSlug: cur.clubSlug, role: cur.r, from: null, to: null }] : []);
  const clubsSeen = new Set(spells.map(s => s.clubSlug)).size;

  return `
  <div class="page">
    <a class="back" href="#/people">${svg('back')} All people</a>

    <div class="card chead"${club && club.colour ? ` style="--club:${esc(club.colour)}"` : ''}>
      ${club && club.crest ? crestImg(club, 'crest lg')
        : `<span class="av" style="width:56px;height:56px;font-size:18px">${esc(initials(name))}</span>`}
      <div>
        <h1>${esc(name)}</h1>
        <div class="meta">
          ${cur ? `<span class="pill${isKeyRole(cur.r) ? ' acc' : ''}">${esc(cur.r || '')}</span>
                   <span>${esc(cur.club || '')}</span>`
                : `<span class="pill bad">No longer in the scan</span>`}
          ${nat ? `<span>${esc(nat)}</span>` : ''}
          ${tm ? `<a href="${esc(tm)}" target="_blank" rel="noopener">Transfermarkt ${svg('ext')}</a>` : ''}
        </div>
      </div>
    </div>

    <div class="g3">
      <div class="card stat"><div class="eyebrow">Clubs seen</div><div class="v num">${clubsSeen}</div></div>
      <div class="card stat"><div class="eyebrow">Spells tracked</div><div class="v num">${spells.length}</div></div>
      <div class="card stat"><div class="eyebrow">${car && car.src === 'tm' ? 'Career from' : 'First tracked'}</div>
        <div class="v">${car ? esc(fmtMonth(car.spells[0].from)) : 'This scan'}</div></div>
    </div>

    <section class="card">
      <div class="hd"><h2>Career</h2>
        <span class="pill">${car ? (car.src === 'tm' ? 'Full history from Transfermarkt' : 'From the scan history, since May') : 'Current position only'}</span></div>
      ${spells.length ? `<ol class="timeline">${spells.map((sp, i) => {
        const c = clubBySlug(sp.clubSlug);
        return `<li class="tl${i === 0 && !sp.left ? ' now' : ''}">
          <div class="tl-dot"></div>
          <div>
            <div class="tl-head">
              ${c && c.crest ? crestImg(c, 'crest') : ''}
              <a class="tl-club" href="#/clubs/${esc(sp.clubSlug || '')}">${esc(sp.club || '')}</a>
              <span class="role${isKeyRole(sp.role) ? ' key' : ''}">${esc(sp.role || '—')}</span>
            </div>
            <div class="tl-meta">
              ${sp.from
                ? (sp.to ? `${esc(fmtMonth(sp.from))} — ${esc(fmtMonth(sp.to))}`
                         : (i === 0 ? `${esc(fmtMonth(sp.from))} — present`
                                    : `From ${esc(fmtMonth(sp.from))}`))
                : 'Current'}
              ${sp.lg ? ` · ${esc(sp.lg)}` : ''}
            </div>
            ${sp.withCount ? `<div class="tl-with">Arrived with ${sp.withCount} other${sp.withCount === 1 ? '' : 's'}: ${sp.with.map(esc).join(', ')}</div>` : ''}
          </div>
        </li>`;
      }).join('')}</ol>` : `<p class="empty">No history recorded.</p>`}
    </section>
  </div>`;
}

/* ── Pipeline ─────────────────────────────────────────────────────── */
/* Read-only on purpose. Logging happens in scripts/outreach.py, because the
   reason the old web form went unused was that filling it in was slower than
   not bothering. The web side is for seeing where everything stands. */
const STAGES = [
  { k: 'to_contact', label: 'To contact' },
  { k: 'contacted',  label: 'Contacted' },
  { k: 'in_talks',   label: 'In talks' },
  { k: 'rejected',   label: 'Rejected' },
];
const todayISO = () => new Date().toISOString().slice(0, 10);
const isDue = o => o.follow_up_date && o.follow_up_date <= todayISO() && o.status !== 'rejected';

function pipelinePage() {
  const all = S.outreach;
  const due = all.filter(isDue);
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>Pipeline</h1>
        <p>${all.length} conversation${all.length === 1 ? '' : 's'} logged${due.length ? `, ${due.length} needing a follow-up` : ''}.</p></div>
    </div>
    ${all.length ? `<div class="board">
      ${STAGES.map(st => {
        const rows = all.filter(o => o.status === st.k);
        return `<section class="col">
          <h2 class="col-head ${st.k}">${esc(st.label)} <em>${rows.length}</em></h2>
          ${rows.length ? rows.map(outreachCard).join('') : `<p class="col-empty">None</p>`}
        </section>`;
      }).join('')}
    </div>` : `<div class="card"><div class="howto">
        <p>Nothing logged yet. Log a contact from the terminal and it appears here on the next deploy:</p>
        <pre>python3 scripts/outreach.py add "Danny Cowley" \\
    --player "Harry French" --method whatsapp --note "keen"</pre>
        <p>Club, role and league are filled in from the scan, so a name is usually enough.</p>
      </div></div>`}
  </div>`;
}

function outreachCard(o) {
  const c = clubBySlug(o.clubSlug);
  return `<a class="o-card${isDue(o) ? ' due' : ''}" href="#/clubs/${esc(o.clubSlug || '')}">
    ${o.player ? `<div class="p">${esc(o.player)}</div>` : ''}
    <div class="c">
      ${c && c.crest ? crestImg(c, 'crest') : `<span class="av">${esc(initials(o.contact_name))}</span>`}
      <span>${esc(o.contact_name)}<small> · ${esc(o.club || '')}</small></span>
    </div>
    ${o.contact_role ? `<div class="note">${esc(o.contact_role)}</div>` : ''}
    ${o.notes ? `<p class="note">${esc(o.notes)}</p>` : ''}
    <div class="f">
      <span>${esc(o.method || '')}${o.deal_type ? ' · ' + esc(o.deal_type) : ''}</span>
      ${isDue(o) ? `<span class="due">Due ${esc(o.follow_up_date)}</span>`
                 : (o.follow_up_date ? `<span class="when">${esc(o.follow_up_date)}</span>` : '')}
    </div>
  </a>`;
}

/* ── League tables ────────────────────────────────────────────────── */
const LG = { country: '' };

function leaguesPage() {
  const withTable = S.leagues.filter(l => l.table && l.table.length);
  const countries = [...new Set(withTable.map(l => l.country).filter(Boolean))].sort();
  const list = withTable.filter(l => !LG.country || l.country === LG.country);
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>League tables</h1><p>${withTable.length} leagues with a live table, scraped with the staff data.</p></div>
    </div>
    <div class="filters">
      <select class="field" id="lg-country"><option value="">All countries</option>
        ${countries.map(x => `<option${x === LG.country ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <span class="count">${list.length} shown</span>
    </div>
    <div class="grid">
      ${list.map(l => {
        const top = l.table[0];
        const c = clubBySlug(top.slug);
        return `<a class="card club-card" href="#/leagues/${esc(l.slug)}">
          <div class="cc-top">
            ${c ? crestImg(c, 'cc-crest') : `<span class="cc-crest"></span>`}
            <div class="cc-id">
              <div class="cc-name">${esc(l.name)}</div>
              <div class="cc-league">${esc(l.country || '')}${l.tier ? ` · Tier ${l.tier}` : ''}</div>
            </div>
          </div>
          <div class="cc-meta"><span>${l.table.length} clubs</span><span>Top: ${esc(top.club)}</span></div>
        </a>`;
      }).join('') || `<p class="empty">No tables for that country.</p>`}
    </div>
  </div>`;
}

function leaguePage(slug) {
  const l = S.leagues.find(x => x.slug === decodeURIComponent(slug));
  if (!l || !l.table.length) return `<div class="page"><p class="empty">No table for that league.</p></div>`;
  const size = l.table.length;
  // What a position wins comes from scans/config/league-bands.json. A league
  // with no entry gets no colours at all, because a guessed European place is
  // worse than none.
  const bands = l.bands || [];
  const band = pos => (bands.find(b => pos >= b.from && pos <= b.to) || {}).kind || '';
  const bandLabel = pos => (bands.find(b => pos >= b.from && pos <= b.to) || {}).label || '';
  const seen = [];
  bands.forEach(b => { if (!seen.some(x => x.label === b.label)) seen.push(b); });
  return `
  <div class="page">
    <a class="back" href="#/leagues">${svg('back')} All tables</a>
    <div class="card chead">
      <div>
        <h1>${esc(l.name)}</h1>
        <div class="meta">
          ${l.country ? `<span class="pill">${esc(l.country)}</span>` : ''}
          ${l.tier ? `<span>Tier ${l.tier}</span>` : ''}
          <span>${size} clubs</span>
          <span>${l.table.filter(r => (S.clubs.find(c => c.slug === r.slug) || {}).needs?.length).length} recruiting</span>
        </div>
      </div>
    </div>
    ${seen.length ? `<div class="key">
      ${seen.map(b => `<span class="keyitem"><i class="swatch ${esc(b.kind)}"></i>${esc(b.label)}</span>`).join('')}
    </div>` : `<div class="callout">No promotion or European places are recorded for this league, so no positions are coloured. Adding them is a one-line entry in the league bands config.</div>`}

    <section class="card">
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th style="width:44px">#</th><th>Club</th>
          <th class="r">P</th><th class="r">W</th><th class="r">D</th><th class="r">L</th>
          <th class="r">GF</th><th class="r">GA</th><th class="r">GD</th><th class="r">Pts</th>
          <th class="r">Needs</th></tr></thead>
        <tbody>${l.table.map(r => {
          const c = clubBySlug(r.slug);
          const b = band(r.pos);
          return `<tr>
            <td><span class="pos-pill ${b}"${b ? ` title="${esc(bandLabel(r.pos))}"` : ''}>${r.pos}</span></td>
            <td><a class="name" href="#/clubs/${esc(r.slug)}">${c ? crestImg(c, 'crest') : ''}${esc(r.club)}</a></td>
            <td class="r num">${esc(r.p ?? '')}</td><td class="r num">${esc(r.w ?? '')}</td>
            <td class="r num">${esc(r.d ?? '')}</td><td class="r num">${esc(r.l ?? '')}</td>
            <td class="r num">${esc(r.gf ?? '')}</td><td class="r num">${esc(r.ga ?? '')}</td>
            <td class="r num">${esc(r.gd ?? '')}</td><td class="r num"><b>${esc(r.pts ?? '')}</b></td>
            <td class="r">${c && c.needs.length ? `<span class="needs" style="justify-content:flex-end">${c.needs.slice(0, 3).map(x => `<span class="need">${esc(x.pos)}</span>`).join('')}${c.needs.length > 3 ? `<span class="need">+${c.needs.length - 3}</span>` : ''}</span>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>
  </div>`;
}

/* ── Archive ──────────────────────────────────────────────────────── */
/* Summer 2026 is done. It stays readable, but out of the working screens. */
function archivePage() {
  return `
  <div class="page">
    <div class="page-head">
      <div><h1>Archive</h1><p>Finished windows and the pages from the previous build. Nothing here feeds the live screens.</p></div>
    </div>

    <section class="card" style="margin-bottom:16px">
      <div class="hd"><h2>Summer 2026 window</h2><span class="pill">Closed</span></div>
      <div class="howto">
        <p>The requirement lists gathered for summer 2026 still drive the club pages, because a club that wanted a left-back in June usually still wants one in January. The player shortlists built for that window are kept here as a record.</p>
      </div>
      ${S.clients.filter(cl => cl.summer2026 && cl.summer2026.length).map(cl => `
        <div class="hd"><h2>${esc(cl.name)} · ${cl.summer2026.length} club shortlist</h2></div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Club</th><th>League</th><th>Deal</th><th>Reasoning at the time</th><th class="r">Score</th></tr></thead>
          <tbody>${cl.summer2026.map(t => `<tr>
            <td>${esc(t.club)}</td><td>${esc(t.league || '')}</td><td>${esc(t.deal || '')}</td>
            <td>${esc((t.reasons || [])[0] || '')}</td>
            <td class="r num">${esc(t.score ?? '')}</td>
          </tr>`).join('')}</tbody>
        </table></div>`).join('') || `<p class="empty">No shortlists archived.</p>`}
    </section>

    <section class="card">
      <div class="hd"><h2>The previous build</h2></div>
      <div class="howto">
        <p>The old site is still deployed and still works. Nothing here feeds the current screens, and it is one link rather than a menu because it is a fallback, not a place to work.</p>
        <a class="btn" href="../index.html">${svg('ext')} Open the previous build</a>
      </div>
    </section>
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
function closePalette() { const s = $('.scrim'); if (s) s.remove(); }

function search(q) {
  q = q.trim().toLowerCase();
  if (!q) return S.clubs.slice(0, 8).map(c => ({ kind: 'Club', c }));
  const out = [];
  for (const cl of S.clients) {
    if ((cl.name || '').toLowerCase().includes(q)) out.push({ kind: 'Mine', cl });
  }
  for (const c of S.clubs) {
    if (out.length >= 7) break;
    if (c.name.toLowerCase().includes(q)) out.push({ kind: 'Club', c });
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
    const sel = i === 0 ? 1 : 0;
    if (h.kind === 'Club') return `<div class="result" data-i="${i}" data-sel="${sel}">
      ${crestImg(h.c, 'crest')}<div class="r-main"><div class="r-name">${esc(h.c.name)}</div>
      <div class="r-sub">${esc(h.c.lg || '')}</div></div><span class="r-kind">Club</span></div>`;
    if (h.kind === 'League') return `<div class="result" data-i="${i}" data-sel="${sel}">
      <div class="r-main"><div class="r-name">${esc(h.l.name)}</div>
      <div class="r-sub">${h.l.clubs.length} clubs</div></div><span class="r-kind">League</span></div>`;
    if (h.kind === 'Mine') return `<div class="result" data-i="${i}" data-sel="${sel}">
      <span class="av">${esc(initials(h.cl.name))}</span><div class="r-main"><div class="r-name">${esc(h.cl.name)}</div>
      <div class="r-sub">${esc(h.cl.pos)} · ${esc(h.cl.club || '')}</div></div><span class="r-kind">My player</span></div>`;
    return `<div class="result" data-i="${i}" data-sel="${sel}">
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
  else if (h.kind === 'Mine') go(`#/mine/${h.cl.slug}`);
  else if (h.kind === 'Staff') go(`#/people/${slugOf(h.p.n)}`);
  else { F.league = h.l.name; F.q = ''; F.country = ''; go('#/clubs'); setTimeout(paintGrid, 0); }
}

function movePal(d) {
  const rows = $('#pal-out') ? $('#pal-out').querySelectorAll('.result') : [];
  if (!rows.length) return;
  palSel = (palSel + d + rows.length) % rows.length;
  rows.forEach((r, i) => { r.dataset.sel = i === palSel ? 1 : 0; });
  rows[palSel].scrollIntoView({ block: 'nearest' });
}

function paintNet() {
  const el = $('#net');
  if (el) el.innerHTML = navigator.onLine ? '' : '<span class="offline">Offline · showing last saved data</span>';
}

/* ── Theme ────────────────────────────────────────────────────────── */
function initTheme() {
  let t = null;
  try { t = localStorage.getItem('lp-theme'); } catch (e) {}
  if (t) document.documentElement.dataset.theme = t;
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('lp-theme', next); } catch (e) {}
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
  const c = (S.meta && S.meta.counts) || {};
  $('.shell').innerHTML = `
    <nav class="rail">
      <div class="brand"><span class="mark">LP</span><span><b>LPCMI</b><small>Recruitment</small></span></div>
      <a class="nav-item" data-route="/today" href="#/today">${svg('today')} Today</a>
      <a class="nav-item" data-route="/clubs" href="#/clubs">${svg('clubs')} Clubs<span class="cnt">${n(c.clubs)}</span></a>
      <a class="nav-item" data-route="/people" href="#/people">${svg('people')} People<span class="cnt">${n(c.staff)}</span></a>
      <a class="nav-item" data-route="/players" href="#/players">${svg('players')} Players<span class="cnt">${n(c.players)}</span></a>
      <a class="nav-item" data-route="/mine" href="#/mine">${svg('mine')} My players<span class="cnt">${n(c.clients)}</span></a>
      <a class="nav-item" data-route="/openings" href="#/openings">${svg('find')} Find a club</a>
      <a class="nav-item" data-route="/pipeline" href="#/pipeline">${svg('pipe')} Pipeline<span class="cnt">${n(c.outreach)}</span></a>
      <a class="nav-item" data-route="/leagues" href="#/leagues">${svg('table')} League tables<span class="cnt">${n(c.leagues)}</span></a>
      <a class="nav-item" data-route="/archive" href="#/archive">${svg('archive')} Archive</a>
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
  if (e.target.id === 'p-q') { P.q = e.target.value; paintPlayers(true); }
  if (e.target.id === 'pe-q') { PF.q = e.target.value; paintPeople(true); }
});

document.addEventListener('change', e => {
  const id = e.target.id;
  // Country narrows the league list, so the whole filter bar is redrawn.
  if (id === 'f-country') { F.country = e.target.value; F.league = ''; $('#view').innerHTML = clubsPage(); paintGrid(); return; }
  if (id === 'f-league') { F.league = e.target.value; paintGrid(); }
  if (id === 'f-tier') { F.tier = e.target.value; paintGrid(); }
  if (id === 'f-need') { F.need = e.target.value; paintGrid(); }
  if (id === 'op-pos') { OPEN.pos = e.target.value; OPEN.shown = 40; render(); return; }
  if (id === 'op-max') { OPEN.max = +e.target.value; OPEN.shown = 40; render(); return; }
  if (id === 'op-country') { OPEN.country = e.target.value; OPEN.shown = 40; render(); return; }
  if (id === 'op-tier') { OPEN.tier = e.target.value; OPEN.shown = 40; render(); return; }
  if (id === 'p-league') { P.league = e.target.value; paintPlayers(true); }
  if (id === 'p-pos') { P.pos = e.target.value; paintPlayers(true); }
  if (id === 'p-status') { P.status = e.target.value; paintPlayers(true); }
  if (id === 'pe-role') { PF.role = e.target.value; paintPeople(true); }
});

function sortBy(k) {
  if (P.sort === k) P.dir *= -1; else { P.sort = k; P.dir = 1; }
  $('#view').innerHTML = playersPage();
  paintPlayers(true);
}

document.addEventListener('click', e => {
  const th = e.target.closest('th[data-sort]');
  if (th) { sortBy(th.dataset.sort); return; }
  if (e.target.id === 'pe-movers') {
    PF.movers = !PF.movers;
    e.target.classList.toggle('on', PF.movers);
    paintPeople(true);
    return;
  }
  if (e.target.id === 'op-need') { OPEN.needOnly = !OPEN.needOnly; OPEN.shown = 40; render(); return; }
  if (e.target.id === 'op-more') { OPEN.shown += 60; render(); return; }
  if (e.target.id === 'f-clear') {
    F.q = ''; F.country = ''; F.league = ''; F.need = ''; F.tier = '';
    $('#view').innerHTML = clubsPage(); paintGrid();
    return;
  }
  if (e.target.id === 'mine-only' || e.target.id === 'mine-more') {
    if (e.target.id === 'mine-only') { MINE.only = !MINE.only; MINE.shown = 25; }
    else MINE.shown += 40;
    render();
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const th = e.target.closest && e.target.closest('th[data-sort]');
  if (th) { e.preventDefault(); sortBy(th.dataset.sort); }
});

window.addEventListener('hashchange', afterRoute);

function afterRoute() {
  render();
  const h = location.hash;
  if (h.includes('/clubs') && !h.includes('/clubs/')) paintGrid();
  // Not a reset: coming back to a list should keep the rows already loaded,
  // as well as the scroll position.
  if (/#\/players$/.test(h)) paintPlayers(false);
  if (h.includes('/people') && !h.match(/\/people\/./)) paintPeople(false);
}

if ('serviceWorker' in navigator) {
  // Registered after load so it never competes with the first data fetch.
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

(async function boot() {
  initTheme();
  $('.shell').innerHTML = `<div class="page"><p class="empty">Loading…</p></div>`;
  try {
    const names = ['clubs', 'leagues', 'meta', 'changes', 'expiring', 'players', 'outreach', 'careers', 'clients'];
    const [clubs, leagues, meta, changes, expiring, players, outreach, careers, clients] =
      await Promise.all(names.map(nm =>
        fetch(`../data/${nm}.json`).then(r => {
          if (!r.ok) throw new Error(`${nm}.json ${r.status}`);
          return r.json();
        }).catch(() => null)));
    if (!clubs) throw new Error('clubs.json could not be loaded');
    S.clubs = clubs; S.leagues = leagues || []; S.meta = meta;
    S.changes = changes; S.expiring = expiring || []; S.players = players || [];
    S.outreach = outreach || []; S.careers = careers || {}; S.clients = clients || [];
    // Staff search flattens clubs rather than shipping a duplicate bundle.
    S.people = clubs.flatMap(c => c.staff.map(s => ({ ...s, club: c.name, clubSlug: c.slug })));
    S.ready = true;

    chrome();
    const cnt = meta.counts;
    $('#rail-foot').innerHTML =
      `<p><span class="dot"></span>Scan <b>${esc(new Date(meta.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</b></p>
       <p>${cnt.leagues} leagues · ${n(cnt.clubs)} clubs</p>
       <p id="net"></p>`;
    paintNet();
    addEventListener('online', paintNet);
    addEventListener('offline', paintNet);
    afterRoute();
  } catch (err) {
    $('.shell').innerHTML = `<div class="page"><p class="empty">Could not load data.<br>${esc(err.message)}</p></div>`;
  }
})();
