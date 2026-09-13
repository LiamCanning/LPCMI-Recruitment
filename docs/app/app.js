/* ═══════════════════════════════════════════════════════════════════
   LPCMI Recruitment — interface v2

   Renders from the JSON bundles written by web/build_data.py. Hash
   routing, so it works on GitHub Pages with no server config.
   ═══════════════════════════════════════════════════════════════════ */

const S = { clubs: [], leagues: [], players: [], meta: null, people: [], changes: null, expiring: [], outreach: [], careers: {}, ready: false };

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
  bolt: 'M13 3 5 13.5h6L11 21l8-10.5h-6z',
  pipe: 'M4 6h5v12H4zM10 6h5v8h-5zM16 6h4v5h-4z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3 2',
  swap: 'M7 9h12l-3-3M17 15H5l3 3',
  arrowIn: 'M12 4v11M8 11l4 4 4-4M5 20h14',
  arrowOut: 'M12 20V9M8 13l4-4 4 4M5 4h14',
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
  { re: /^\/players$/, view: playersPage },
  { re: /^\/pipeline$/, view: pipelinePage },
  { re: /^\/people\/([^/]+)$/, view: personPage },
  { re: /^\/people$/, view: peoplePage },
  { re: /^\/today$/, view: todayPage },
  { re: /^\/?$/, view: todayPage },
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


/* ── Today ────────────────────────────────────────────────────────── */
function fmtSince(d) {
  if (!d || d.length !== 8) return '';
  const dt = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function clubBySlug(slug) { return S.clubs.find(c => c.slug === slug); }

function changeRow(kind, r) {
  const to = r.toSlug || r.clubSlug;
  const c = clubBySlug(to);
  const sub = kind === 'move'
    ? `${esc(r.from)} → ${esc(r.to)}`
    : esc(r.club || '');
  return `<a class="row" href="#/clubs/${esc(to || '')}">
    <span class="chg ${kind}">${svg(kind === 'move' ? 'swap' : kind === 'in' ? 'arrowIn' : 'arrowOut')}</span>
    ${c ? crestImg(c, 'row-crest') : ''}
    <div class="row-main">
      <div class="row-name">${esc(r.n)}</div>
      <div class="row-sub">${sub}</div>
    </div>
    <span class="role${isKeyRole(r.r) ? ' key' : ''}">${esc(r.r || '—')}</span>
  </a>`;
}

function todayPage() {
  const ch = S.changes;
  const since = ch && ch.since ? fmtSince(ch.since) : null;
  const moves = ch ? ch.moves : [];
  const arrivals = ch ? ch.arrivals : [];
  const departures = ch ? ch.departures : [];
  const total = moves.length + arrivals.length + departures.length;

  // Expiring contracts matter most where the club has said it needs that role.
  const needSlugs = new Set(S.clubs.filter(c => c.needs.length).map(c => c.slug));
  const exp = S.expiring.filter(p => p.months <= 12);
  const expHot = exp.filter(p => needSlugs.has(p.clubSlug));

  return `
  <div class="page">
    <div class="page-head">
      <h1>Today</h1>
      <p>${total
        ? `${total} staff change${total === 1 ? '' : 's'} since ${esc(since)}, across ${ch.clubsCompared} clubs compared.`
        : `No staff changes since ${esc(since || 'the last scan')}.`}</p>
    </div>

    <div class="stats">
      <div class="stat"><b>${moves.length}</b><span>Moves</span></div>
      <div class="stat up"><b>${arrivals.length}</b><span>Arrivals</span></div>
      <div class="stat down"><b>${departures.length}</b><span>Departures</span></div>
      <div class="stat"><b>${expHot.length}</b><span>Expiring at a club that is recruiting</span></div>
    </div>

    <div class="cols">
      <div style="display:grid;gap:18px">
        ${section('Moves', 'move', moves, 'Nobody changed club.')}
        ${section('Arrivals', 'in', arrivals, 'No new appointments.')}
        ${section('Departures', 'out', departures, 'Nobody left.')}
      </div>

      <section class="panel">
        <h2>${svg('clock')} Contracts running down <em>${expHot.length}</em></h2>
        ${expHot.length ? expHot.slice(0, 40).map(p => {
          const c = clubBySlug(p.clubSlug);
          return `<a class="row" href="#/clubs/${esc(p.clubSlug)}">
            ${c ? crestImg(c, 'row-crest') : ''}
            <div class="row-main">
              <div class="row-name">${esc(p.n)}</div>
              <div class="row-sub">${esc(p.pos || '')} · ${esc(p.club || '')}</div>
            </div>
            <span class="role${p.months <= 6 ? ' hot' : ''}">${esc(p.exp || '')}</span>
          </a>`;
        }).join('')
        : `<p class="empty">Nothing expiring within a year at a club with an open requirement.</p>`}
      </section>
    </div>
  </div>`;
}

function section(title, kind, rows, emptyText) {
  return `<section class="panel">
    <h2>${title} <em>${rows.length}</em></h2>
    ${rows.length ? rows.slice(0, 25).map(r => changeRow(kind, r)).join('')
                  : `<p class="empty">${esc(emptyText)}</p>`}
  </section>`;
}


/* ── Players ──────────────────────────────────────────────────────── */
/* 3,381 rows. The old page rendered every one into the markup, which is how
   all.html reached 192,099 DOM nodes. This renders a window of them and grows
   it on scroll, so the node count stays in the hundreds however long the list. */

const P = { q: '', league: '', pos: '', status: '', sort: 'n', dir: 1, shown: 60 };
const PAGE = 60;

const MV = v => {
  const m = /([\d.]+)\s*(m|k|bn)?/i.exec(String(v || ''));
  if (!m) return -1;
  const mult = { bn: 1e9, m: 1e6, k: 1e3 }[(m[2] || '').toLowerCase()] || 1;
  return parseFloat(m[1]) * mult;
};
const EXPKEY = v => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(v || ''));
  return m ? +`${m[3]}${m[2]}${m[1]}` : Infinity;
};

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
      <h1>Players</h1>
      <p>Every tracked player. Sort any column; the list loads as you scroll.</p>
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
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr>${COLS.map(c =>
          `<th data-sort="${c.k}" class="${P.sort === c.k ? 'on' : ''}" tabindex="0" role="button">
             ${esc(c.label)}<i>${P.sort === c.k ? (P.dir > 0 ? '▴' : '▾') : ''}</i></th>`).join('')}
        </tr></thead>
        <tbody id="p-body"></tbody>
      </table>
    </div>
    <div id="p-more"></div>
  </div>`;
}

function playersFiltered() {
  const q = P.q.trim().toLowerCase();
  let list = S.players.filter(p =>
    (!q || (p.n || '').toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q)) &&
    (!P.league || p.lg === P.league) &&
    (!P.pos || p.pos === P.pos) &&
    (P.status !== 'loan' || /on loan/i.test(p.status || '')) &&
    (P.status !== 'expiring' || EXPKEY(p.exp) <= 20270911));
  const col = COLS.find(c => c.k === P.sort) || COLS[0];
  return list.sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    const r = col.num ? x - y : String(x || '').localeCompare(String(y || ''));
    return r * P.dir;
  });
}

function paintPlayers(reset) {
  const body = $('#p-body');
  if (!body) return;
  if (reset) P.shown = PAGE;
  const list = playersFiltered();
  const slice = list.slice(0, P.shown);
  body.innerHTML = slice.map(p => {
    const soon = EXPKEY(p.exp) <= 20270911;
    const loan = /on loan/i.test(p.status || '');
    return `<tr>
      <td><a href="${esc(p.tm || '#')}" target="_blank" rel="noopener">${esc(p.n)}</a>
        ${loan ? '<span class="tag">Loan</span>' : ''}</td>
      <td><a href="#/clubs/${esc(p.clubSlug)}">${esc(p.club || '')}</a></td>
      <td>${esc(p.pos || '')}</td>
      <td class="num">${esc(p.age || '')}</td>
      <td>${esc(p.nat || '')}</td>
      <td class="num${soon ? ' hot' : ''}">${esc(p.exp || '')}</td>
      <td class="num">${esc(p.mv || '')}</td>
    </tr>`;
  }).join('');
  $('#p-count').textContent = `${list.length.toLocaleString()} of ${S.players.length.toLocaleString()}`;
  $('#p-more').innerHTML = list.length > P.shown
    ? `<button class="more" id="p-more-btn">Show more (${(list.length - P.shown).toLocaleString()} left)</button>` : '';
  const btn = $('#p-more-btn');
  if (btn) btn.addEventListener('click', () => { P.shown += PAGE * 4; paintPlayers(); });
}



/* ── People ───────────────────────────────────────────────────────── */
/* The scan history is the thing nobody else has: seven snapshots back to May.
   A person page turns that into a career, and a club page into a destination. */

const slugOf = n => (n || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const PF = { q: '', role: '', movers: false, shown: 60 };

function peoplePage() {
  return `
  <div class="page">
    <div class="page-head">
      <h1>People</h1>
      <p>Every tracked staff member. ${Object.keys(S.careers).length.toLocaleString()} have a career history across seven scans since May.</p>
    </div>
    <div class="filters">
      <input class="field" id="pe-q" type="search" placeholder="Search name, club or role…" value="${esc(PF.q)}" style="flex:1 1 240px">
      <select class="field" id="pe-role">
        <option value="">All roles</option>
        <option value="director"${PF.role === 'director' ? ' selected' : ''}>Directors</option>
        <option value="recruit"${PF.role === 'recruit' ? ' selected' : ''}>Recruitment &amp; scouting</option>
        <option value="manager"${PF.role === 'manager' ? ' selected' : ''}>Management</option>
      </select>
      <button class="chip${PF.movers ? ' on' : ''}" id="pe-movers">Moved club</button>
      <span class="count" id="pe-count"></span>
    </div>
    <div id="pe-list" class="rows"></div>
    <div id="pe-more"></div>
  </div>`;
}

const ROLE_GROUP = {
  director: /director|chief executive|president|chairman|owner/i,
  recruit: /recruit|scout/i,
  manager: /manager|head coach|coach/i,
};

function peopleFiltered() {
  const q = PF.q.trim().toLowerCase();
  return S.people.filter(p => {
    if (PF.movers) {
      const c = S.careers[slugOf(p.n)];
      if (!c || new Set(c.spells.map(s => s.clubSlug)).size < 2) return false;
    }
    if (PF.role && !(ROLE_GROUP[PF.role] || /.^/).test(p.r || '')) return false;
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
    const c = S.clubs.find(x => x.slug === p.clubSlug);
    const car = S.careers[slugOf(p.n)];
    const moves = car ? new Set(car.spells.map(s => s.clubSlug)).size - 1 : 0;
    return `<a class="row" href="#/people/${esc(slugOf(p.n))}">
      ${c ? crestImg(c, 'row-crest') : ''}
      <div class="row-main">
        <div class="row-name">${esc(p.n)}</div>
        <div class="row-sub">${esc(p.club || '')}${p.nat ? ' · ' + esc(p.nat) : ''}</div>
      </div>
      ${moves > 0 ? `<span class="moves">${moves} move${moves === 1 ? '' : 's'}</span>` : ''}
      <span class="role${isKeyRole(p.r) ? ' key' : ''}">${esc(p.r || '—')}</span>
    </a>`;
  }).join('') || `<p class="empty">Nobody matches.</p>`;
  $('#pe-count').textContent = `${list.length.toLocaleString()} of ${S.people.length.toLocaleString()}`;
  $('#pe-more').innerHTML = list.length > PF.shown
    ? `<button class="more" id="pe-more-btn">Show more (${(list.length - PF.shown).toLocaleString()} left)</button>` : '';
  const b = $('#pe-more-btn');
  if (b) b.addEventListener('click', () => { PF.shown += 240; paintPeople(); });
}

function fmtMonth(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function personPage(slug) {
  slug = decodeURIComponent(slug);
  const cur = S.people.find(p => slugOf(p.n) === slug);
  const car = S.careers[slug];
  if (!cur && !car) return `<div class="page"><p class="empty">Nobody by that name.</p></div>`;

  const name = cur ? cur.n : car.name;
  const nat = (cur && cur.nat) || (car && car.nat) || '';
  const tm = (cur && cur.tm) || (car && car.tm) || '';
  const club = cur ? S.clubs.find(c => c.slug === cur.clubSlug) : null;

  // Newest first reads better for a career: where are they now, then how they got here.
  const spells = car ? [...car.spells].reverse()
    : (cur ? [{ club: cur.club, clubSlug: cur.clubSlug, role: cur.r, from: null, to: null }] : []);
  const clubsSeen = new Set(spells.map(s => s.clubSlug)).size;

  return `
  <div class="page">
    <a class="back" href="#/people">${svg('back')} All people</a>

    <div class="club-head">
      ${club ? crestImg(club, '') : ''}
      <div>
        <h1>${esc(name)}</h1>
        <div class="club-sub">
          ${cur ? `<span>${esc(cur.r || '')}${cur.club ? ' · ' + esc(cur.club) : ''}</span>`
                : `<span class="gone">No longer in the scan</span>`}
          ${nat ? `<span>${esc(nat)}</span>` : ''}
          ${tm ? `<a href="${esc(tm)}" target="_blank" rel="noopener">Transfermarkt ${svg('ext')}</a>` : ''}
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><b>${clubsSeen}</b><span>${clubsSeen === 1 ? 'Club' : 'Clubs'} seen</span></div>
      <div class="stat"><b>${spells.length}</b><span>${spells.length === 1 ? 'Spell' : 'Spells'}</span></div>
      ${car ? `<div class="stat"><b>${fmtMonth(car.spells[0].from)}</b><span>First tracked</span></div>` : ''}
    </div>

    <section class="panel">
      <h2>Career <em>${car ? 'from the scan history' : 'current only'}</em></h2>
      ${spells.length ? `<ol class="timeline">${spells.map((sp, i) => {
        const c = S.clubs.find(x => x.slug === sp.clubSlug);
        return `<li class="tl${i === 0 && !sp.left ? ' now' : ''}">
          <div class="tl-dot"></div>
          <div class="tl-body">
            <div class="tl-head">
              ${c ? crestImg(c, 'row-crest') : ''}
              <a class="tl-club" href="#/clubs/${esc(sp.clubSlug || '')}">${esc(sp.club || '')}</a>
              <span class="role${isKeyRole(sp.role) ? ' key' : ''}">${esc(sp.role || '—')}</span>
            </div>
            <div class="tl-meta">
              ${sp.from ? `${fmtMonth(sp.from)} — ${(sp.left || i > 0) ? fmtMonth(sp.to) : 'present'}` : 'Current'}
              ${sp.lg ? ` · ${esc(sp.lg)}` : ''}
            </div>
            ${sp.withCount ? `<div class="tl-with">Arrived with ${sp.withCount} other${sp.withCount === 1 ? '' : 's'}: ${sp.with.map(esc).join(', ')}</div>` : ''}
          </div>
        </li>`;
      }).join('')}</ol>`
      : `<p class="empty">No history recorded.</p>`}
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

const today = () => new Date().toISOString().slice(0, 10);
const isDue = o => o.follow_up_date && o.follow_up_date <= today() && o.status !== 'rejected';

function pipelinePage() {
  const all = S.outreach;
  if (!all.length) {
    return `<div class="page">
      <div class="page-head"><h1>Pipeline</h1>
        <p>Nothing logged yet.</p></div>
      <div class="panel"><div class="howto">
        <p>Log a contact from the terminal, and it appears here on the next deploy:</p>
        <pre>python3 scripts/outreach.py add "James Hicks" \\
    --player "Tom Nixon" --method whatsapp --note "keen"</pre>
        <p>Club, role and league are filled in from the scan, so a name is usually enough.</p>
      </div></div></div>`;
  }
  const due = all.filter(isDue);
  return `
  <div class="page">
    <div class="page-head">
      <h1>Pipeline</h1>
      <p>${all.length} contact${all.length === 1 ? '' : 's'} logged${due.length ? `, ${due.length} needing a follow-up` : ''}.</p>
    </div>
    <div class="board">
      ${STAGES.map(st => {
        const rows = all.filter(o => o.status === st.k);
        return `<section class="col">
          <h2 class="col-head ${st.k}">${esc(st.label)} <em>${rows.length}</em></h2>
          ${rows.length ? rows.map(outreachCard).join('')
                        : `<p class="col-empty">None</p>`}
        </section>`;
      }).join('')}
    </div>
  </div>`;
}

function outreachCard(o) {
  const c = S.clubs.find(x => x.slug === o.clubSlug);
  return `<a class="o-card${isDue(o) ? ' due' : ''}" href="#/clubs/${esc(o.clubSlug || '')}">
    <div class="o-top">
      ${c ? crestImg(c, 'row-crest') : ''}
      <div class="row-main">
        <div class="row-name">${esc(o.contact_name)}</div>
        <div class="row-sub">${esc(o.contact_role || '')}</div>
      </div>
    </div>
    <div class="o-club">${esc(o.club || '')}</div>
    ${o.player ? `<div class="o-for">for ${esc(o.player)}</div>` : ''}
    ${o.notes ? `<p class="o-note">${esc(o.notes)}</p>` : ''}
    <div class="o-foot">
      <span class="o-method">${esc(o.method || '')}</span>
      ${isDue(o) ? `<span class="o-due">Follow up</span>`
                 : (o.follow_up_date ? `<span>${esc(o.follow_up_date)}</span>` : '')}
    </div>
  </a>`;
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

function paintNet() {
  const el = $('#net');
  if (el) el.innerHTML = navigator.onLine ? '' : '<span class="offline">Offline · showing last saved data</span>';
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
      <div class="brand">
        <small>LPCMI</small>
        <b>Recruitment<br>Intelligence</b>
        <span>de Liam</span>
      </div>
      <a class="nav-item" data-route="/today" href="#/today"><span class="nv">⚡️</span> Today</a>
      <a class="nav-item" data-route="/clubs" href="#/clubs"><span class="nv">🏟️</span> Clubs</a>
      <a class="nav-item" data-route="/people" href="#/people"><span class="nv">👥</span> People</a>
      <a class="nav-item" data-route="/players" href="#/players"><span class="nv">⚽️</span> Players</a>
      <a class="nav-item" data-route="/pipeline" href="#/pipeline"><span class="nv">📣</span> Pipeline</a>
      <div class="nav-label">Previous build</div>
      <a class="nav-item" href="../index.html"><span class="nv">🗂️</span> Old dashboard</a>
      <a class="nav-item" href="../league-tables.html"><span class="nv">🏆</span> League tables</a>
      <a class="nav-item" href="../all.html"><span class="nv">⚽️</span> Players</a>
      <a class="nav-item" href="../master-database.html"><span class="nv">🔎</span> Staff directory</a>
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
  if (e.target.id === 'f-league') { F.league = e.target.value; paintGrid(); }
  if (e.target.id === 'f-need') { F.need = e.target.value; paintGrid(); }
  if (e.target.id === 'p-league') { P.league = e.target.value; paintPlayers(true); }
  if (e.target.id === 'p-pos') { P.pos = e.target.value; paintPlayers(true); }
  if (e.target.id === 'p-status') { P.status = e.target.value; paintPlayers(true); }
  if (e.target.id === 'pe-role') { PF.role = e.target.value; paintPeople(true); }
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
  if (h.includes('/players')) paintPlayers(true);
  if (h.includes('/people') && !h.match(/\/people\/./)) paintPeople(true);
}

if ('serviceWorker' in navigator) {
  // Registered after load so it never competes with the first data fetch.
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

(async function boot() {
  initTheme();
  chrome();
  $('#view').innerHTML = `<div class="page"><p class="empty">Loading…</p></div>`;
  try {
    const [clubs, leagues, meta, changes, expiring, players, outreach, careers] = await Promise.all(
      ['clubs', 'leagues', 'meta', 'changes', 'expiring', 'players', 'outreach', 'careers'].map(n =>
        fetch(`../data/${n}.json`).then(r => {
          if (!r.ok) throw new Error(`${n}.json ${r.status}`);
          return r.json();
        }).catch(() => null)));
    if (!clubs) throw new Error('clubs.json could not be loaded');
    S.clubs = clubs; S.leagues = leagues || []; S.meta = meta;
    S.changes = changes; S.expiring = expiring || []; S.players = players || [];
    S.outreach = outreach || []; S.careers = careers || {};
    // Staff search flattens clubs rather than shipping a duplicate bundle.
    S.people = clubs.flatMap(c => c.staff.map(s => ({ ...s, club: c.name, clubSlug: c.slug })));
    S.ready = true;
    const n = meta.counts;
    $('#rail-foot').innerHTML =
      `<p><b>${n.clubs}</b> clubs · <b>${n.staff.toLocaleString()}</b> staff</p>
       <p><b>${n.players.toLocaleString()}</b> players · <b>${n.leagues}</b> leagues</p>
       <p id="net"></p>`;
    paintNet();
    addEventListener('online', paintNet);
    addEventListener('offline', paintNet);
    afterRoute();
  } catch (err) {
    $('#view').innerHTML = `<div class="page"><p class="empty">Could not load data.<br>${esc(err.message)}</p></div>`;
  }
})();
