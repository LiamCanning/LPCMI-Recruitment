// OutreachLog pipeline + Firebase sync module (extracted from legacy build)
const OutreachLog = (function() {
  const STORAGE_KEY = 'outreach_log';
  const MIGRATED_KEY = 'outreach_log_migrated';

  // ── Firebase sync state ──
  let _fbRef = null;
  let _fbInitialized = false;
  // In-memory cache: always holds the most recent entries regardless of source.
  // Prevents stale-localStorage reads that cause duplicate additions.
  let _entriesCache = null;

  // Called once Firebase is loaded — db is firebase.database()
  function initFirebase(db) {
    if (_fbInitialized || !db) return;
    _fbInitialized = true;
    _fbRef = db.ref('outreach_log');

    // Re-render when ContactVerify overrides change so freshness badges update live
    if (typeof ContactVerify !== 'undefined' && ContactVerify.onChange) {
      ContactVerify.onChange(function() {
        if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
      });
    }

    // After the first sync we stop reading localStorage in the listener.
    // This prevents a race where Firebase fires with stale data after a local
    // save (e.g. a deletion), reads the now-updated localStorage, treats the
    // deleted ID as "offline only", and pushes it back to Firebase.
    let _syncedOnce = false;

    _fbRef.on('value', function(snapshot) {
      const val = snapshot.val();
      const fbEntries = val && Array.isArray(val.entries) ? val.entries : [];

      if (!_syncedOnce) {
        // First fire only: push local-only entries (added while offline) to Firebase.
        _syncedOnce = true;
        const localRaw = localStorage.getItem(STORAGE_KEY);
        const localEntries = localRaw ? JSON.parse(localRaw).entries || [] : [];
        const fbIds = new Set(fbEntries.map(function(e) { return e.id; }));
        // Content-key set to prevent pushing entries that already exist in Firebase
        // with a different ID (e.g. added locally before Firebase loaded)
        const fbContentKeys = new Set(fbEntries.map(function(e) {
          return (e.club||'').toLowerCase()+'|'+(e.player||'').toLowerCase()+'|'+(e.contact||e.email||'').toLowerCase();
        }));
        const offlineOnly = localEntries.filter(function(e) {
          if (!e || !e.id || fbIds.has(e.id)) return false;
          var ck = (e.club||'').toLowerCase()+'|'+(e.player||'').toLowerCase()+'|'+(e.contact||e.email||'').toLowerCase();
          return !fbContentKeys.has(ck);
        });
        if (offlineOnly.length) {
          const merged = fbEntries.concat(offlineOnly).sort(function(x, y) { return new Date(x.date) - new Date(y.date); });
          _fbRef.set({ entries: merged }); // triggers another listener fire
          return;
        }
      }

      // Firebase is authoritative — use it directly (respects remote deletions)
      _entriesCache = fbEntries.slice();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: fbEntries }));
      if (_currentContainerId && _currentOpts) {
        render(_currentContainerId, _currentOpts);
      }
    });
  }

  // ── helpers ──
  function olEsc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function genId() {
    return 'ol_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
  }

  // League → country mapping (compact, covers all tracked leagues)
  const L2C = {};
  const CL = {
    'England':['Premier League','Championship','League One','League Two','National League','National League North','National League South'],
    'Scotland':['Scottish Premiership','Scottish Championship'],
    'Ireland':['League of Ireland'],
    'Spain':['LaLiga','LaLiga II'],
    'Germany':['Bundesliga','2. Bundesliga'],
    'Italy':['Serie A','Serie B'],
    'France':['Ligue 1','Ligue 2'],
    'Netherlands':['Eredivisie','Eerste Divisie'],
    'Belgium':['Belgian Pro League'],
    'Switzerland':['Swiss Super League'],
    'Denmark':['Danish Superliga'],
    'Austria':['Austrian Bundesliga'],
    'Portugal':['Liga Portugal','Liga Portugal 2'],
    'Sweden':['Allsvenskan'],
    'Norway':['Eliteserien'],
    'USA':['MLS'],
    'UAE':['UAE Pro League'],
    'Saudi Arabia':['Saudi Pro League','Saudi First Division'],
    'Qatar':['Qatar Stars League','Qatari Second Division'],
    'Cyprus':['Cypriot First Division']
  };
  Object.entries(CL).forEach(([country, leagues]) => { leagues.forEach(lg => { L2C[lg] = country; }); });

  function countryForLeague(lg) { return L2C[lg] || 'Other'; }

  // League tier for sorting (lower = higher tier)
  const TIER = {'Premier League':1,'LaLiga':1,'Bundesliga':1,'Serie A':1,'Ligue 1':1,
    'Championship':2,'LaLiga II':2,'2. Bundesliga':2,'Serie B':2,'Ligue 2':2,
    'Eredivisie':2,'Liga Portugal':2,'Belgian Pro League':2,'Scottish Premiership':2,
    'Swiss Super League':3,'Danish Superliga':3,'Austrian Bundesliga':3,'Allsvenskan':3,
    'Eliteserien':3,'MLS':3,'Cypriot First Division':3,'League of Ireland':3,
    'Liga Portugal 2':4,'Eerste Divisie':4,'Scottish Championship':4,
    'League One':4,'League Two':5,'National League':6};

  function leagueTier(lg) { return TIER[lg] || 50; }

  // ── CRUD ──
  function load() {
    if (_entriesCache !== null) return _entriesCache.slice();
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw).entries || [] : []; }
    catch(e) { return []; }
  }

  function save(entries) {
    _entriesCache = entries.slice();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries: entries }));
    if (_fbRef) _fbRef.set({ entries: entries });
  }

  function addEntry(opts) {
    const entries = load();
    const now = new Date().toISOString();
    entries.push({
      id: genId(),
      player: opts.player || 'General',
      contact: opts.contact || '',
      role: opts.role || '',
      email: opts.email || '',
      phone: opts.phone || '',
      profile_url: opts.profile_url || '',
      club_url: opts.club_url || '',
      club: opts.club || '',
      league: opts.league || '',
      country: opts.country || countryForLeague(opts.league || ''),
      reason: opts.reason || '',
      deal_type: opts.deal_type || '',
      status: opts.status || 'contacted',
      notes: '',
      notes_log: opts.notes ? [{date: now, text: opts.notes}] : [],
      follow_up: opts.follow_up || '',
      date: now,
      source: opts.source || 'manual'
    });
    save(entries);
    return entries;
  }

  function updateStatus(id, status) {
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) {
      e.status = status;
      // Append status-change note to history
      if (!e.notes_log) e.notes_log = [];
      const labels = {contacted:'Contacted',in_talks:'In Talks',offered:'Contract Offered',reject:'Rejected'};
      e.notes_log.push({date: new Date().toISOString(), text: '🔄 ' + (labels[status]||status), auto: true});
      save(entries);
    }
  }

  function updateNotes(id, text) {
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) { e.notes = text; save(entries); }
  }

  function appendNote(id, text) {
    if (!text || !text.trim()) return;
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) {
      if (!e.notes_log) e.notes_log = e.notes ? [{date: e.date, text: e.notes}] : [];
      e.notes_log.push({date: new Date().toISOString(), text: text.trim()});
      e.notes = text.trim(); // keep legacy field in sync
      save(entries);
    }
    // Keyed update: refresh the inline notes preview on the row without full re-render
    const allE = load();
    const updE = allE.find(x => x.id === id);
    const userNotes2 = ((updE && updE.notes_log) || []).filter(function(n){return !n.auto;});
    const userNoteCount = userNotes2.length;
    const row = document.querySelector('tr[data-id="'+id+'"], .ol-card[data-id="'+id+'"]');
    if (row) {
      const td = row.querySelector('.ol-td-notes');
      if (td) {
        const latestN = userNoteCount ? userNotes2[userNoteCount-1].text : '';
        const preview = latestN.length > 72 ? latestN.slice(0,72)+'…' : latestN;
        const more = userNoteCount > 1 ? '<span class="ol-notes-more">+'+(userNoteCount-1)+'</span>' : '';
        let prevDiv = td.querySelector('.ol-notes-preview');
        if (userNoteCount > 0) {
          if (prevDiv) {
            prevDiv.innerHTML = olEsc(preview) + more;
          } else {
            prevDiv = document.createElement('div');
            prevDiv.className = 'ol-notes-preview';
            prevDiv.setAttribute('onclick', 'event.stopPropagation();OutreachLog.openNotesPop(\''+id+'\',this)');
            prevDiv.innerHTML = olEsc(preview) + more;
            td.insertBefore(prevDiv, td.firstChild);
          }
        } else if (prevDiv) { prevDiv.remove(); }
        const addBtn = td.querySelector('.ol-note-add-btn');
        if (addBtn) addBtn.textContent = userNoteCount ? '+ add' : '+ note';
      }
    } else if (_currentContainerId && _currentOpts) {
      render(_currentContainerId, _currentOpts);
    }
  }

  function updateFollowUp(id, dateStr) {
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) { e.follow_up = dateStr; save(entries); }
  }

  function updateContact(id, name) {
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) { e.contact = name.trim(); save(entries); }
  }

  function updateRole(id, role) {
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) { e.role = role.trim(); save(entries); }
  }

  function updateDealType(id, dealType) {
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (e) { e.deal_type = dealType; save(entries); }
  }

  function removeEntry(id) {
    let entries = load();
    entries = entries.filter(x => x.id !== id);
    save(entries);
  }

  // ── One-shot migration: status 'pipeline' → 'queued' (runs every load until done) ──
  function migratePipelineToQueued() {
    const entries = load();
    let changed = false;
    entries.forEach(function(e) {
      if (e.status === 'pipeline') { e.status = 'queued'; changed = true; }
    });
    if (changed) save(entries);
  }

  // ── Migration from old contacted_* keys ──
  function migrate() {
    migratePipelineToQueued();
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const entries = load();
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('contacted_')) continue;
      const club = key.slice('contacted_'.length);
      const date = localStorage.getItem(key) || new Date().toISOString();
      const note = localStorage.getItem('note_' + club) || '';
      entries.push({
        id: genId(),
        player: 'General',
        contact: '',
        role: '',
        email: '',
        club: club,
        league: '',
        country: '',
        status: 'none',
        notes: note,
        date: date,
        source: 'legacy'
      });
      toDelete.push(key);
      if (note) toDelete.push('note_' + club);
    }
    if (toDelete.length) {
      save(entries);
      toDelete.forEach(k => localStorage.removeItem(k));
    }
    localStorage.setItem(MIGRATED_KEY, '1');
  }

  // ── Auto-add from email outreach ──
  function autoAddFromEmail(contacts, playerName) {
    const entries = load();
    contacts.forEach(c => {
      // Skip if already logged this contact+player combo today
      const today = new Date().toISOString().slice(0,10);
      const dup = entries.find(e =>
        e.email === c.email && e.player === playerName && e.date.slice(0,10) === today
      );
      if (dup) return;
      entries.push({
        id: genId(),
        player: playerName || 'General',
        contact: c.name || '',
        role: c.role || '',
        email: c.email || '',
        club: c.club || '',
        league: c.league || '',
        country: countryForLeague(c.league || ''),
        status: 'contacted',
        notes: '',
        date: new Date().toISOString(),
        source: 'email'
      });
    });
    save(entries);
  }

  // ── Pipeline (pre-outreach) — now a thin alias of addEntry({status:'queued'}) ──
  function addToPipeline(opts, event) {
    if (event) event.stopPropagation();
    const entries = load();
    // Avoid duplicates: same club+player+contact already exists at any status
    const contactKey = (opts.contact || opts.email || '').toLowerCase();
    const existing = entries.find(function(e) {
      if (e.club !== opts.club || e.player !== opts.player) return false;
      if (contactKey) return (e.contact||e.email||'').toLowerCase() === contactKey;
      return e.status === 'queued'; // no contact info: block same club+player queued dup
    });
    if (existing) {
      if (event && event.target) { event.target.textContent = '✓ Already added'; }
      return;
    }
    addEntry(Object.assign({}, opts, {
      status: 'queued',
      source: opts.source || 'pipeline'
    }));
    // Visual feedback on button
    if (event && event.target) {
      const btn = event.target;
      btn.textContent = '✓ Added';
      btn.style.background = '#dcfce7';
      btn.style.color = '#16a34a';
      btn.style.borderColor = '#86efac';
      // Show remove button sibling
      const removeBtn = btn.nextElementSibling;
      if (removeBtn && removeBtn.classList.contains('mp-remove-pipeline')) removeBtn.style.display = '';
    }
    // Re-render if outreach log is open
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function isInPipeline(club, player) {
    return load().some(function(e) { return e.club === club && e.player === player && e.status === 'queued'; });
  }

  function removeFromPipeline(club, player, event) {
    if (event) event.stopPropagation();
    let entries = load();
    entries = entries.filter(function(e) { return !(e.club === club && e.player === player && e.status === 'queued'); });
    save(entries);
    // Reset add button
    if (event && event.target) {
      const removeBtn = event.target;
      const addBtn = removeBtn.previousElementSibling;
      if (addBtn && addBtn.classList.contains('mp-add-pipeline')) {
        addBtn.textContent = '+ Outreach';
        addBtn.style.cssText = '';
      }
      removeBtn.style.display = 'none';
    }
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  // ── Build flat contacts array from contactsData for autofill ──
  function buildContactsList(contactsData) {
    const list = [];
    if (!contactsData) return list;
    Object.entries(contactsData).forEach(([club, arr]) => {
      (arr || []).forEach(c => {
        if (!c.name) return;
        list.push({
          name: c.name,
          role: c.role || '',
          email: c.email || '',
          phone: c.phone || '',
          profile_url: c.profile_url || '',
          club: club,
          league: c.league || '',
          country: countryForLeague(c.league || '')
        });
      });
    });
    return list;
  }

  // ── League colors ──
  var _leagueColors = {
    'Premier League':           {bg:'#faf5ff', border:'#7c3aed', text:'#6d28d9', pill:'#7c3aed'},
    'Championship':             {bg:'#eff6ff', border:'#2563eb', text:'#1d4ed8', pill:'#2563eb'},
    'League One':               {bg:'#ecfdf5', border:'#059669', text:'#047857', pill:'#059669'},
    'League Two':               {bg:'#f0fdf4', border:'#16a34a', text:'#15803d', pill:'#16a34a'},
    'National League':          {bg:'#fefce8', border:'#ca8a04', text:'#a16207', pill:'#ca8a04'},
    'National League North':    {bg:'#fffbeb', border:'#d97706', text:'#b45309', pill:'#d97706'},
    'National League South':    {bg:'#fffbeb', border:'#d97706', text:'#b45309', pill:'#d97706'},
    'Scottish Premiership':     {bg:'#eef2ff', border:'#4f46e5', text:'#4338ca', pill:'#4f46e5'},
    'Scottish Championship':    {bg:'#f0f9ff', border:'#0284c7', text:'#0369a1', pill:'#0284c7'},
    'Belgian Pro League':       {bg:'#fff7ed', border:'#ea580c', text:'#c2410c', pill:'#ea580c'},
    'League of Ireland':        {bg:'#f0fdf4', border:'#22c55e', text:'#16a34a', pill:'#22c55e'},
    'Bundesliga':               {bg:'#fef2f2', border:'#dc2626', text:'#b91c1c', pill:'#dc2626'},
    'La Liga':                  {bg:'#fff1f2', border:'#e11d48', text:'#be123c', pill:'#e11d48'},
    'Serie A':                  {bg:'#eff6ff', border:'#1e40af', text:'#1e3a5f', pill:'#1e40af'},
    'Ligue 1':                  {bg:'#f0fdf4', border:'#15803d', text:'#14532d', pill:'#15803d'},
    'Eredivisie':               {bg:'#fff7ed', border:'#ea580c', text:'#c2410c', pill:'#ea580c'},
  };
  var _defaultLeagueColor = {bg:'#f8fafc', border:'#64748b', text:'#475569', pill:'#64748b'};
  function leagueColor(lg) {
    return _leagueColors[lg] || _defaultLeagueColor;
  }

  // ── CSV Export ──
  function exportCSV() {
    const entries = load();
    const cols = ['Player','Contact','Role','Club','League','Country','Status','Phone','Date Added','Follow-up Date','Latest Note'];
    const statusLabel = {none:'None',in_talks:'In Talks',offered:'Offered',reject:'Rejected',pipeline:'Pipeline'};
    const rows = entries.map(function(e) {
      const latestNote = (e.notes_log && e.notes_log.filter(function(n){return !n.auto;}).pop() || {}).text || e.notes || '';
      const followUp = e.follow_up ? e.follow_up : '';
      const dateStr = e.date ? new Date(e.date).toLocaleDateString('en-GB') : '';
      return [e.player,e.contact,e.role,e.club,e.league,e.country,statusLabel[e.status]||e.status,e.phone||'',dateStr,followUp,latestNote]
        .map(function(v){ const s=String(v||''); return s.includes(',')||s.includes('"')||s.includes('\n') ? '"'+s.replace(/"/g,'""')+'"' : s; })
        .join(',');
    });
    const csv = [cols.join(',')].concat(rows).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'outreach_log_' + new Date().toISOString().slice(0,10) + '.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Draft message helpers ──
  function buildMailtoHref(email, firstName, draft, club) {
    var body = (draft.body || '').replace(/\[FirstName\]/g, firstName || '').replace(/\[Club\]/g, club || '');
    var subject = (draft.subject || '').replace(/\[Club\]/g, club || '').replace(/\[FirstName\]/g, firstName || '');
    return 'mailto:' + email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function openDraftPicker(btn) {
    var email = btn.dataset.email;
    var firstName = btn.dataset.firstname;
    var player = btn.dataset.player;
    var club = btn.dataset.club || '';
    var drafts = (_currentOpts && _currentOpts.drafts) || {};
    var playerDraft = drafts[player] || {};

    var existing = document.getElementById('ol-draft-pop');
    if (existing) { existing.remove(); if (existing.dataset.email === email) return; }

    var pop = document.createElement('div');
    pop.id = 'ol-draft-pop';
    pop.dataset.email = email;
    pop.className = 'ol-draft-pop';

    var html = '<div class="ol-draft-section-hdr">Email</div>';
    if (playerDraft.email_loan) {
      html += '<a class="ol-draft-opt" href="'+olEsc(buildMailtoHref(email, firstName, playerDraft.email_loan, club))+'">📤 Loan draft</a>';
    }
    if (playerDraft.email_permanent) {
      html += '<a class="ol-draft-opt" href="'+olEsc(buildMailtoHref(email, firstName, playerDraft.email_permanent, club))+'">📤 Permanent draft</a>';
    }
    if (playerDraft.email_followup) {
      html += '<a class="ol-draft-opt" href="'+olEsc(buildMailtoHref(email, firstName, playerDraft.email_followup, club))+'">📩 Follow-up draft</a>';
    }
    html += '<a class="ol-draft-opt ol-draft-blank" href="mailto:'+olEsc(email)+'">✉ Blank email</a>';

    // (WhatsApp has its own picker button — no WA section here)

    pop.innerHTML = html;
    document.body.appendChild(pop);

    var rect = btn.getBoundingClientRect();
    pop.style.top = (rect.bottom + 4) + 'px';
    pop.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 210)) + 'px';
    setTimeout(function() {
      function outside(ev) {
        var p = document.getElementById('ol-draft-pop');
        if (p && !p.contains(ev.target) && ev.target !== btn) { p.remove(); document.removeEventListener('click', outside); }
      }
      document.addEventListener('click', outside);
    }, 50);
  }

  function openWAPicker(btn) {
    var waBase = btn.dataset.wabase;
    var firstName = btn.dataset.firstname;
    var player = btn.dataset.player;
    var drafts = (_currentOpts && _currentOpts.drafts) || {};
    var playerDraft = drafts[player] || {};

    var existing = document.getElementById('ol-wa-pop');
    if (existing) { existing.remove(); return; }

    var pop = document.createElement('div');
    pop.id = 'ol-wa-pop';
    pop.className = 'ol-draft-pop';

    var html = '<div class="ol-draft-section-hdr">WhatsApp</div>';
    if (playerDraft.whatsapp_loan) {
      var loanText = playerDraft.whatsapp_loan.replace(/\[FirstName\]/g, firstName || '');
      html += '<a class="ol-draft-opt ol-draft-wa" href="'+olEsc(waBase+'&text='+encodeURIComponent(loanText))+'" target="_blank">💬 Loan message</a>';
    }
    if (playerDraft.whatsapp_permanent) {
      var permText = playerDraft.whatsapp_permanent.replace(/\[FirstName\]/g, firstName || '');
      html += '<a class="ol-draft-opt ol-draft-wa" href="'+olEsc(waBase+'&text='+encodeURIComponent(permText))+'" target="_blank">💬 Permanent message</a>';
    }
    html += '<a class="ol-draft-opt ol-draft-blank" href="'+olEsc(waBase)+'" target="_blank">💬 Open blank</a>';

    pop.innerHTML = html;
    document.body.appendChild(pop);
    var rect = btn.getBoundingClientRect();
    pop.style.top = (rect.bottom + 4) + 'px';
    pop.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 210)) + 'px';
    setTimeout(function() {
      function outside(ev) {
        var p = document.getElementById('ol-wa-pop');
        if (p && !p.contains(ev.target) && ev.target !== btn) { p.remove(); document.removeEventListener('click', outside); }
      }
      document.addEventListener('click', outside);
    }, 50);
  }

  // ── Notes Popover ──
  function openNotesPop(id, btn) {
    const existing = document.getElementById('ol-notes-pop');
    if (existing) { existing.remove(); if (existing.dataset.entryId === id) return; }
    const entries = load();
    const e = entries.find(x => x.id === id);
    if (!e) return;
    // Migrate legacy flat note
    if (!e.notes_log) e.notes_log = e.notes ? [{date: e.date, text: e.notes, auto:false}] : [];
    const userNotes = e.notes_log.filter(function(n){ return !n.auto; });
    const autoNotes = e.notes_log.filter(function(n){ return n.auto; });
    const pop = document.createElement('div');
    pop.id = 'ol-notes-pop';
    pop.className = 'ol-notes-pop';
    pop.dataset.entryId = id;
    const historyHtml = e.notes_log.length
      ? e.notes_log.slice().reverse().map(function(n) {
          const d = n.date ? new Date(n.date).toLocaleDateString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
          return '<div class="ol-note-item'+(n.auto?' ol-note-auto':'')+'"><span class="ol-note-text">'+olEsc(n.text)+'</span><span class="ol-note-date">'+olEsc(d)+'</span></div>';
        }).join('')
      : '<div style="color:#94a3b8;font-size:12px;padding:8px 0">No notes yet</div>';
    pop.innerHTML = '<div class="ol-notes-pop-hdr">Activity Log</div>'
      + '<div class="ol-notes-history">'+historyHtml+'</div>'
      + '<div class="ol-notes-add">'
      + '<textarea id="ol-note-input-'+id+'" placeholder="Add a note..." rows="2" style="width:100%;padding:6px 8px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;font-family:inherit;resize:none;box-sizing:border-box"></textarea>'
      + '<button onclick="OutreachLog.appendNote(\''+olEsc(id)+'\', document.getElementById(\'ol-note-input-'+id+'\').value);document.getElementById(\'ol-notes-pop\').remove()" style="margin-top:6px;width:100%;padding:6px;background:#1e40af;color:white;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Add Note</button>'
      + '</div>';
    document.body.appendChild(pop);
    const rect = btn.getBoundingClientRect();
    const top = Math.min(rect.bottom + 4, window.innerHeight - 320);
    const left = Math.max(4, Math.min(rect.left - 180, window.innerWidth - 304));
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
    setTimeout(function() {
      function outside(e) {
        var p = document.getElementById('ol-notes-pop');
        if (p && !p.contains(e.target) && e.target !== btn) { p.remove(); document.removeEventListener('click', outside); }
      }
      document.addEventListener('click', outside);
    }, 50);
  }

  // ── Render ──
  // containerId: DOM id of the container div
  // opts: { contactsData, playerNames, filterPlayer }
  let _autofillList = null;
  let _selectedContact = null;
  let _debounceTimer = null;
  let _currentContainerId = null;
  let _currentOpts = null;
  let _resizeHook = false;

  // Active filter state per containerId
  const _filterStatus = {};   // '' | 'none' | 'in_talks' | 'offered' | 'reject'
  const _filterCountry = {};  // '' | country name
  const _filterLeague = {};   // '' | league name
  const _filterPlayerSel = {}; // '' (all) | player name — tracks which player is selected in the dropdown
  const _fpWidths = {};        // saved panel widths per containerId
  const _visibleCounts = {};   // pagination: entries rendered per containerId
  const PAGE_SIZE = 50;

  // Build profile_url lookup from contacts data: email → url
  function buildProfileMap(contactsData) {
    const map = {};
    if (!contactsData) return map;
    Object.values(contactsData).forEach(function(arr) {
      (arr || []).forEach(function(c) {
        if (c.email && c.profile_url) map[c.email] = c.profile_url;
        if (c.name && c.profile_url) map[c.name] = c.profile_url;
      });
    });
    return map;
  }

  let _profileMap = null;

  function render(containerId, opts) {
    _currentContainerId = containerId;
    _currentOpts = opts;
    const container = document.getElementById(containerId);
    if (!container) return;

    const filterMode = opts.filterMode || 'panel'; // 'panel' (left sidebar) | 'bar' (top horizontal)

    // Container layout depends on filter mode
    if (filterMode === 'panel') {
      container.style.cssText = 'display:flex;flex:1;min-height:0;overflow:hidden;position:relative';
    } else {
      container.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;position:relative';
    }

    const contactsData = opts.contactsData || {};
    const playerNames = opts.playerNames || ['General'];
    const filterPlayer = opts.filterPlayer || '';
    const drafts = opts.drafts || {};

    if (!_autofillList) _autofillList = buildContactsList(contactsData);
    if (!_profileMap) _profileMap = buildProfileMap(contactsData);
    const _clubUrls = opts.clubUrls || {};
    const _contactsData = contactsData;

    // Default filter: 'Needs Action' in bar mode (outreach), blank in panel mode (club requirements)
    if (typeof _filterStatus[containerId] === 'undefined') {
      _filterStatus[containerId] = (filterMode === 'bar') ? '_needs_action' : '';
    }
    if (!_filterCountry[containerId]) _filterCountry[containerId] = '';
    if (!_filterLeague[containerId]) _filterLeague[containerId] = '';
    if (filterPlayer && !_filterPlayerSel[containerId]) _filterPlayerSel[containerId] = filterPlayer;

    // One-shot runtime migration: any stale pipeline entries → queued
    migratePipelineToQueued();

    let rawEntries = load();
    const activePlayerFilter = _filterPlayerSel[containerId] || '';
    if (activePlayerFilter) rawEntries = rawEntries.filter(function(e) { return e.player === activePlayerFilter; });

    // Pipeline merged into main list: queued is now just another status.
    const pipelineEntries = []; // kept as empty for legacy UI paths
    let allEntries = rawEntries.slice();
    // Normalize any lingering 'pipeline' values (defensive)
    allEntries.forEach(function(e){ if (e.status === 'pipeline') e.status = 'queued'; });

    const allCountries = [...new Set(allEntries.map(function(e) { return e.country || countryForLeague(e.league || ''); }).filter(Boolean))].sort();
    const allLeagues = [...new Set(allEntries.map(function(e) { return e.league; }).filter(Boolean))]
      .sort(function(a,b) { return (leagueTier(a) - leagueTier(b)) || a.localeCompare(b); });

    let entries = allEntries;
    if (_filterStatus[containerId]) entries = entries.filter(function(e) {
      var st = _filterStatus[containerId];
      if (st === '_needs_action') return needsAction(e);
      if (st === 'contacted') return e.status === 'contacted' || e.status === 'none';
      return e.status === st;
    });
    if (_filterCountry[containerId]) entries = entries.filter(function(e) {
      return (e.country || countryForLeague(e.league || '')) === _filterCountry[containerId];
    });
    if (_filterLeague[containerId]) entries = entries.filter(function(e) { return e.league === _filterLeague[containerId]; });

    // Pagination — only render current page of entries
    if (!_visibleCounts[cid]) _visibleCounts[cid] = PAGE_SIZE;
    const _visLimit = _visibleCounts[cid];
    const visEntries = entries.slice(0, _visLimit);
    const hasMore = entries.length > _visLimit;

    const byLeague = {};
    visEntries.forEach(function(e) {
      const lg = e.league || 'Unknown';
      if (!byLeague[lg]) byLeague[lg] = [];
      byLeague[lg].push(e);
    });
    const sortedLeagues = Object.keys(byLeague).sort(function(a,b) { return (leagueTier(a) - leagueTier(b)) || a.localeCompare(b); });

    const cid = containerId;
    const fs = _filterStatus[cid];
    const fc = _filterCountry[cid];
    const fl = _filterLeague[cid] || '';

    const today = new Date().toISOString().slice(0,10);
    const allRaw = load();
    let migrated = false;
    allRaw.forEach(function(e) {
      if (!e.notes_log && e.notes) { e.notes_log = [{date: e.date||new Date().toISOString(), text: e.notes, auto:false}]; migrated = true; }
      else if (!e.notes_log) { e.notes_log = []; }
    });
    if (migrated) save(allRaw);

    const countByStatus = {};
    allEntries.forEach(function(e) { var s = e.status || 'none'; countByStatus[s] = (countByStatus[s] || 0) + 1; });
    const totalContacted = allEntries.length;
    const contactedCount = (countByStatus.contacted||0) + (countByStatus.none||0);

    let html = '';

    // Count for "Needs Action" chip (must include follow-ups + stale queued)
    const needsActionCount = allEntries.filter(function(e){ return needsAction(e); }).length;

    // ── LEFT FILTER PANEL (only in 'panel' mode) ─────────────────────────
    if (filterMode === 'panel') {
      const savedPanelW = (_fpWidths[cid]) || (function(){ try { return localStorage.getItem('fp_width_'+cid) || '210px'; } catch(e){ return '210px'; } })();
      html += '<div class="filter-panel ol-filter-panel" id="ol-fp-'+cid+'" style="width:'+savedPanelW+'">';
      html += '<div class="fp-top"><span class="fp-title">Filters</span><button class="fp-reset" onclick="OutreachLog.clearFilters(\''+olEsc(cid)+'\')">Reset</button></div>';

      // Player
      html += '<div class="fp-section"><div class="fp-section-hdr">Player</div>';
      html += '<select class="toolbar-select fp-geo-select" id="ol-player-sel-'+cid+'" onchange="OutreachLog.setPlayerFilter(\''+olEsc(cid)+'\',this.value)">';
      if (playerNames.length > 1) html += '<option value=""'+(activePlayerFilter===''?' selected':'')+'>All Players</option>';
      playerNames.forEach(function(n) { html += '<option value="'+olEsc(n)+'"'+(activePlayerFilter===n?' selected':'')+'>'+olEsc(n)+'</option>'; });
      html += '</select></div>';

      // Status chips
      html += '<div class="fp-section"><div class="fp-section-hdr">Status</div><div class="fp-chips">';
      [['_needs_action','Needs Action','needs_action'],
       ['','All','all'],
       ['queued','Queued','queued'],
       ['contacted','Contacted','contacted'],
       ['in_talks','In Talks','in_talks'],
       ['offered','Offered','offered'],
       ['reject','Rejected','reject']
      ].forEach(function(s) {
        const badge = (s[0]==='_needs_action' && needsActionCount) ? ' <span class="ol-chip-badge">'+needsActionCount+'</span>' : '';
        html += '<div class="fp-chip ol-status-chip ol-s-chip-'+s[2]+(fs===s[0]?' active':'')+'" onclick="OutreachLog.setFilter(\''+olEsc(cid)+'\',\'status\',\''+s[0]+'\')">'+s[1]+badge+'</div>';
      });
      html += '</div></div>';

      // Country
      html += '<div class="fp-section"><div class="fp-section-hdr">Country</div>';
      html += '<select class="toolbar-select fp-geo-select" onchange="OutreachLog.setFilter(\''+olEsc(cid)+'\',\'country\',this.value)">';
      html += '<option value="">All countries</option>';
      allCountries.forEach(function(c) { html += '<option value="'+olEsc(c)+'"'+(fc===c?' selected':'')+'>'+olEsc(c)+'</option>'; });
      html += '</select></div>';

      // League (if multiple)
      if (allLeagues.length > 1) {
        html += '<div class="fp-section"><div class="fp-section-hdr">League</div>';
        html += '<select class="toolbar-select fp-geo-select" onchange="OutreachLog.setFilter(\''+olEsc(cid)+'\',\'league\',this.value)">';
        html += '<option value="">All leagues</option>';
        allLeagues.forEach(function(l) { html += '<option value="'+olEsc(l)+'"'+(fl===l?' selected':'')+'>'+olEsc(l)+'</option>'; });
        html += '</select></div>';
      }
      html += '</div>'; // end filter-panel

      // ── RESIZE HANDLE ──
      html += '<div class="fp-resize-handle" id="fp-handle-'+cid+'" title="Drag to resize · Double-click to collapse"></div>';
    }

    // ── MAIN CONTENT ─────────────────────────────────────────────────────
    html += '<div class="filter-main" id="ol-fm-'+cid+'">';

    // Header: count + overdue badge + add form + tools
    const overdueCount = allEntries.filter(function(e){ return e.follow_up && e.follow_up < today && e.status !== 'reject'; }).length;
    const queuedCount = allEntries.filter(function(e){ return e.status === 'queued'; }).length;
    html += '<div class="filter-main-hdr">';
    if (filterMode === 'panel') {
      html += '<button class="mobile-fp-toggle" onclick="window.toggleMobileFilters(this)" title="Show/hide filters">&#9776; Filters</button>';
    }
    html += '<span class="fmh-count">'+entries.length+(entries.length!==1?' contacts':' contact');
    if (queuedCount && filterMode !== 'bar') html += ' &middot; <span class="fmh-queue-badge">'+queuedCount+' queued</span>';
    if (overdueCount) html += ' <span class="fmh-overdue-badge">⚠ '+overdueCount+' overdue</span>';
    html += '</span>';
    html += '<div style="display:flex;gap:7px;margin-left:auto;align-items:center;flex-wrap:wrap">';
    html += '<input type="search" class="ol-search" id="ol-search-'+cid+'" placeholder="Search…" oninput="OutreachLog._onSearch(this,\''+olEsc(cid)+'\')" autocomplete="off">';
    html += '<div class="ol-autofill-wrap"><input type="text" class="fp-search" id="ol-af-'+cid+'" placeholder="Add contact..." autocomplete="off" style="min-width:180px"><div class="ol-autofill-dd" id="ol-dd-'+cid+'"></div></div>';
    html += '<button class="pt-outreach-btn" id="ol-add-'+cid+'" style="padding:6px 12px;font-size:12px">+ Add</button>';
    html += '<button class="ol-tool-btn" onclick="OutreachLog.exportCSV()" title="Export to CSV">⬇ CSV</button>';
    html += '</div></div>'; // end tools row + filter-main-hdr

    // ── FILTER BAR (bar mode only) — replaces sidebar ────────────────────
    if (filterMode === 'bar') {
      html += '<div class="ol-filter-bar">';
      [['_needs_action','Needs Action'],
       ['','All'],
       ['queued','Queued'],
       ['contacted','Contacted'],
       ['in_talks','In Talks'],
       ['offered','Offered'],
       ['reject','Rejected']
      ].forEach(function(s) {
        let label = s[1];
        if (s[0]==='_needs_action' && needsActionCount) label += ' <span class="ol-chip-badge">'+needsActionCount+'</span>';
        else if (s[0]==='queued' && queuedCount) label += ' <span class="ol-chip-badge">'+queuedCount+'</span>';
        html += '<div class="ol-chip'+(fs===s[0]?' active':'')+'" onclick="OutreachLog.setFilter(\''+olEsc(cid)+'\',\'status\',\''+s[0]+'\')">'+label+'</div>';
      });
      // Player select if multiple
      if (playerNames.length > 1) {
        html += '<span class="ol-filter-sep"></span>';
        html += '<select class="toolbar-select" onchange="OutreachLog.setPlayerFilter(\''+olEsc(cid)+'\',this.value)">';
        html += '<option value=""'+(activePlayerFilter===''?' selected':'')+'>All Players</option>';
        playerNames.forEach(function(n) { html += '<option value="'+olEsc(n)+'"'+(activePlayerFilter===n?' selected':'')+'>'+olEsc(n)+'</option>'; });
        html += '</select>';
      }
      // Country + League overflow
      html += '<span class="ol-filter-sep"></span>';
      html += '<select class="toolbar-select" onchange="OutreachLog.setFilter(\''+olEsc(cid)+'\',\'country\',this.value)">';
      html += '<option value="">All countries</option>';
      allCountries.forEach(function(c) { html += '<option value="'+olEsc(c)+'"'+(fc===c?' selected':'')+'>'+olEsc(c)+'</option>'; });
      html += '</select>';
      if (allLeagues.length > 1) {
        html += '<select class="toolbar-select" onchange="OutreachLog.setFilter(\''+olEsc(cid)+'\',\'league\',this.value)">';
        html += '<option value="">All leagues</option>';
        allLeagues.forEach(function(l) { html += '<option value="'+olEsc(l)+'"'+(fl===l?' selected':'')+'>'+olEsc(l)+'</option>'; });
        html += '</select>';
      }
      if (fs || fc || fl) {
        html += '<button class="ol-chip ol-chip-clear" onclick="OutreachLog.clearFilters(\''+olEsc(cid)+'\')">✕ Clear</button>';
      }
      html += '</div>';
    }

    // Scrollable content area
    html += '<div class="ol-scroll-area">';

    // Pipeline section removed: queued entries now render inline as normal rows.

    if (!entries.length) {
      html += '<div class="ol-empty">'+(allEntries.length ? 'No entries match the current filter.' : 'No outreach logged yet. Use the form above to add your first entry.')+'</div>';
    } else {
      const showPlayerCol = !activePlayerFilter;
      const colSpan = showPlayerCol ? 7 : 6;

      // ── MOBILE CARDS ─────────────────────────────────────────────────
      html += '<div class="ol-cards">';
      sortedLeagues.forEach(function(lg) {
        const country = countryForLeague(lg);
        html += '<div class="ol-card-league-hdr">'+olEsc(lg)+' <span class="ol-card-league-country">'+olEsc(country)+'</span></div>';
        byLeague[lg].forEach(function(e) {
          const displayStatus = e.status === 'none' ? 'contacted' : e.status;
          const initials = (e.contact||'').split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase() || '?';
          const avatarColorMap = {queued:'#64748b', contacted:'#94a3b8', in_talks:'#22c55e', offered:'#16a34a', reject:'#ef4444'};
          const avatarBg = avatarColorMap[displayStatus] || '#94a3b8';
          const STATUS_LABEL_MAP = {queued:'Queued',contacted:'Contacted',in_talks:'In Talks',offered:'Offered',reject:'Rejected'};
          const dateStr = (function() { try { return new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); } catch(ex) { return ''; } })();
          const firstName = (e.contact || '').split(' ')[0];
          const fuVal = e.follow_up || '';
          const fuOverdue = fuVal && fuVal < today;
          const fuDisplay = fuVal ? (function(){ try { return new Date(fuVal).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); } catch(ex){return fuVal;} })() : '';
          const notesLog = e.notes_log || (e.notes ? [{date:e.date,text:e.notes}] : []);
          const userNotes = notesLog.filter(function(n){return !n.auto;});
          const lastNote = userNotes.length ? userNotes[userNotes.length-1].text : '';

          // Build compose / WA for card
          var cardCompose = '';
          if (e.email) {
            const rowPlayerDraft = drafts[e.player] || {};
            const rowHasDraft = !!(rowPlayerDraft.email_loan || rowPlayerDraft.email_permanent);
            if (rowHasDraft) {
              cardCompose = '<button class="ol-card-btn ol-card-btn-email" data-email="'+olEsc(e.email)+'" data-firstname="'+olEsc(firstName)+'" data-player="'+olEsc(e.player||'')+'" data-club="'+olEsc(e.club||'')+'" onclick="event.stopPropagation();OutreachLog.openDraftPicker(this)">✉ Email ▾</button>';
            } else {
              const mailSubject = encodeURIComponent('Player Suggestion');
              const mailBody = encodeURIComponent('Hi ' + firstName + ',\n\n');
              const mailHref = 'mailto:'+e.email+'?subject='+mailSubject+'&body='+mailBody;
              cardCompose = '<button class="ol-card-btn ol-card-btn-email" onclick="event.stopPropagation();OutreachLog.openMailto(\''+olEsc(e.id)+'\',\''+olEsc(mailHref)+'\')">✉ Email</button>';
            }
          }
          var waNumC = (e.phone||'').replace(/[\s\-\(\)\+]/g, '');
          if (waNumC.match(/^0[0-9]/)) waNumC = '44' + waNumC.slice(1);
          var waBaseC = waNumC ? 'https://api.whatsapp.com/send?phone='+waNumC : '';
          var cardWA = '';
          if (waNumC) {
            const rowPlayerDraft = drafts[e.player] || {};
            const rowHasWaDraft = !!(rowPlayerDraft.whatsapp_loan || rowPlayerDraft.whatsapp_permanent);
            if (rowHasWaDraft) {
              cardWA = '<button class="ol-card-btn ol-card-btn-wa" data-wabase="'+olEsc(waBaseC)+'" data-firstname="'+olEsc(firstName)+'" data-player="'+olEsc(e.player||'')+'" onclick="event.stopPropagation();OutreachLog.openWAPicker(this)">💬 WA ▾</button>';
            } else {
              cardWA = '<button class="ol-card-btn ol-card-btn-wa" onclick="event.stopPropagation();OutreachLog.openWA(\''+olEsc(e.id)+'\',\''+olEsc(waBaseC)+'\')">💬 WA</button>';
            }
          }

          html += '<div class="ol-card ol-s-'+displayStatus+(fuOverdue?' ol-row-overdue':'')+'" data-id="'+olEsc(e.id)+'">';
          // Header row: avatar, club + league, checkbox
          html += '<div class="ol-card-hdr">';
          html += '<input type="checkbox" class="ol-row-cb ol-card-cb" data-id="'+olEsc(e.id)+'" data-email="'+olEsc(e.email||'')+'" data-player="'+olEsc(e.player||'')+'" data-firstname="'+olEsc(firstName||'')+'" data-club="'+olEsc(e.club||'')+'" onchange="OutreachLog.toggleRowCheckbox(\''+olEsc(cid)+'\')">';
          html += '<span class="ol-card-avatar" style="background:'+avatarBg+'">'+initials+'</span>';
          html += '<div class="ol-card-meta">';
          html += '<div class="ol-card-club">'+olEsc(e.club||'—')+'</div>';
          if (showPlayerCol && e.player && e.player !== 'General') {
            html += '<div class="ol-card-player">'+olEsc(e.player)+'</div>';
          }
          html += '</div>';
          html += '<button class="ol-card-remove" onclick="OutreachLog.onRemove(\''+olEsc(e.id)+'\')" title="Remove">&times;</button>';
          html += '</div>'; // card-hdr
          // Contact line
          html += '<div class="ol-card-contact">'+olEsc(e.contact||'—')+(e.role?'<span class="ol-card-role"> · '+olEsc(e.role)+'</span>':'')+'</div>';
          // Status + date row
          html += '<div class="ol-card-status-row">';
          html += '<span class="ol-status-pill ol-sp-'+displayStatus+'" onclick="event.stopPropagation();OutreachLog.openStatusPicker(\''+olEsc(e.id)+'\',this)">'+STATUS_LABEL_MAP[displayStatus]+'</span>';
          html += '<span class="ol-card-date">'+olEsc(dateStr)+'</span>';
          if (fuDisplay) html += '<span class="ol-card-fu'+(fuOverdue?' overdue':'')+'">Due '+olEsc(fuDisplay)+'</span>';
          html += '</div>';
          // Last note (if any)
          if (lastNote) html += '<div class="ol-card-note">"'+olEsc(lastNote.length>80?lastNote.slice(0,77)+'…':lastNote)+'"</div>';
          // Actions row
          html += '<div class="ol-card-actions">';
          if (cardCompose) html += cardCompose;
          if (cardWA) html += cardWA;
          html += '<button class="ol-card-btn ol-card-btn-note" onclick="OutreachLog.openNotesPop(\''+olEsc(e.id)+'\',this)">+ Note'+(userNotes.length?' ('+userNotes.length+')':'')+'</button>';
          html += '</div>';
          html += '</div>'; // end card
        });
      });
      html += '</div>'; // end ol-cards

      // ── DESKTOP TABLE ────────────────────────────────────────────────
      html += '<div class="ol-table-wrap"><table class="ol-table"><thead><tr>';
      html += '<th class="ol-th-cb"><input type="checkbox" title="Select all" onchange="OutreachLog.toggleAllCheckboxes(this,\''+olEsc(cid)+'\')"></th>';
      if (showPlayerCol) html += '<th class="ol-th-player">Player</th>';
      html += '<th class="ol-th-contact">Contact</th><th class="ol-th-club">Club</th><th class="ol-th-status">Status</th><th class="ol-th-fu">Follow-up</th><th class="ol-th-notes">Notes</th><th class="ol-th-remove"></th>';
      html += '</tr></thead><tbody>';

      sortedLeagues.forEach(function(lg) {
        const country = countryForLeague(lg);
        html += '<tr class="ol-league-hdr"><td colspan="'+colSpan+'"><span class="ol-league-label">'+olEsc(lg)+'</span><span class="ol-country-tag">'+olEsc(country)+'</span></td></tr>';
        byLeague[lg].sort(function(a,b) { return a.club.localeCompare(b.club) || new Date(b.date) - new Date(a.date); });
        byLeague[lg].forEach(function(e) {
          const dateStr = (function() { try { return new Date(e.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); } catch(ex) { return ''; } })();
          const profileUrl = e.profile_url || _profileMap[e.email] || _profileMap[e.contact] || '';
          const contactName = olEsc(e.contact||'—');
          const contactHtml = profileUrl
            ? '<a href="'+olEsc(profileUrl)+'" target="_blank" class="ol-contact-link" onclick="event.stopPropagation()">'+contactName+'</a>'
            : '<span class="ol-editable" contenteditable="true" data-field="contact" data-id="'+olEsc(e.id)+'">'+contactName+'</span>';
          const firstName = (e.contact || '').split(' ')[0];
          const rowPlayerDraft = drafts[e.player] || {};
          const rowHasDraft = !!(rowPlayerDraft.email_loan || rowPlayerDraft.email_permanent);
          var composeLink = '';
          if (e.email) {
            if (rowHasDraft) {
              composeLink = '<button class="ol-compose-btn ol-compose-has-draft" data-email="'+olEsc(e.email)+'" data-firstname="'+olEsc(firstName)+'" data-player="'+olEsc(e.player||'')+'" data-club="'+olEsc(e.club||'')+'" onclick="event.stopPropagation();OutreachLog.openDraftPicker(this)" title="Email (drafts available)">✉ ▾</button>';
            } else {
              const mailSubject = encodeURIComponent('Player Suggestion');
              const mailBody = encodeURIComponent('Hi ' + firstName + ',\n\n');
              const mailHref = 'mailto:'+e.email+'?subject='+mailSubject+'&body='+mailBody;
              composeLink = '<button class="ol-compose-btn" onclick="event.stopPropagation();OutreachLog.openMailto(\''+olEsc(e.id)+'\',\''+olEsc(mailHref)+'\')" title="Email '+olEsc(e.contact||e.email)+'">✉</button>';
            }
          }
          var waNum = (e.phone||'').replace(/[\s\-\(\)\+]/g, '');
          if (waNum.match(/^0[0-9]/)) waNum = '44' + waNum.slice(1);
          var waBase = waNum ? 'https://api.whatsapp.com/send?phone='+waNum : '';
          var rowHasWaDraft = waNum && (rowPlayerDraft.whatsapp_loan || rowPlayerDraft.whatsapp_permanent);
          var _waSvgRow = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.616l4.528-1.468A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.336 0-4.512-.752-6.278-2.032l-.44-.328-2.884.935.962-2.842-.36-.468A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>';
          var waLink = '';
          if (waNum) {
            if (rowHasWaDraft) {
              waLink = '<button class="ol-wa-btn ol-wa-has-draft" data-wabase="'+olEsc(waBase)+'" data-firstname="'+olEsc(firstName)+'" data-player="'+olEsc(e.player||'')+'" onclick="event.stopPropagation();OutreachLog.openWAPicker(this)" title="WhatsApp (drafts available)">'+_waSvgRow+' ▾</button>';
            } else {
              waLink = '<button class="ol-wa-btn" onclick="event.stopPropagation();OutreachLog.openWA(\''+olEsc(e.id)+'\',\''+olEsc(waBase)+'\')" title="WhatsApp '+olEsc(e.phone)+'">'+_waSvgRow+'</button>';
            }
          }

          // Follow-up cell
          const fuVal = e.follow_up || '';
          const fuOverdue = fuVal && fuVal < today;
          const fuSoon = fuVal && !fuOverdue && fuVal <= new Date(Date.now()+7*86400000).toISOString().slice(0,10);
          const fuDisplay = fuVal
            ? (function(){ try { return new Date(fuVal).toLocaleDateString('en-GB',{day:'numeric',month:'short'}); } catch(ex){return fuVal;} })()
            : '';
          const fuBadge = fuOverdue ? ' <span class="ol-fu-badge ol-fu-badge-overdue">overdue</span>' : (fuSoon ? ' <span class="ol-fu-badge ol-fu-badge-soon">this week</span>' : '');

          // Notes: show full concatenated note history (user notes only)
          const notesLog = e.notes_log || (e.notes ? [{date:e.date,text:e.notes}] : []);
          const userNotes = notesLog.filter(function(n){return !n.auto;});
          const noteDisplay = userNotes.length
            ? '<div class="ol-notes-full">' + userNotes.map(function(n,i){
                return '<div class="ol-note-item">'+(userNotes.length>1?'<span class="ol-note-idx">'+(i+1)+'.</span> ':'')+olEsc(n.text)+'</div>';
              }).join('') + '</div>'
            : '<span style="color:#cbd5e1">—</span>';

          // Status computed early so it can be used on the <tr> class and avatar color
          const displayStatus = e.status === 'none' ? 'contacted' : e.status;
          const initials = (e.contact||'').split(' ').map(function(w){return w[0]||'';}).join('').slice(0,2).toUpperCase() || '?';
          const avatarColorMap = {queued:'#64748b', contacted:'#94a3b8', in_talks:'#22c55e', offered:'#16a34a', reject:'#ef4444'};
          const avatarHtml = '<span class="ol-avatar" style="background:'+(avatarColorMap[displayStatus]||'#94a3b8')+'">'+initials+'</span>';
          html += '<tr class="ol-row ol-s-'+displayStatus+(fuOverdue?' ol-row-overdue':'')+'" data-id="'+olEsc(e.id)+'">';
          html += '<td class="ol-td-cb"><input type="checkbox" class="ol-row-cb" data-id="'+olEsc(e.id)+'" data-email="'+olEsc(e.email||'')+'" data-player="'+olEsc(e.player||'')+'" data-firstname="'+olEsc(firstName||'')+'" data-club="'+olEsc(e.club||'')+'" onchange="OutreachLog.toggleRowCheckbox(\''+olEsc(cid)+'\')"></td>';
          if (showPlayerCol) html += '<td class="ol-td-player">'+olEsc(e.player||'General')+'</td>';
          // Freshness badge next to the name (reads contacts_data if provided)
          let verifyBadgeHtml = '';
          if (typeof ContactVerify !== 'undefined' && _contactsData) {
            const clubContacts = _contactsData[e.club] || [];
            const match = clubContacts.find(function(c) { return (c.name || '').toLowerCase() === (e.contact || '').toLowerCase(); });
            if (match) {
              const vc = { name: match.name, club: e.club, first_seen_at: match.first_seen_at, last_seen_at: match.last_seen_at, departed_at: match.departed_at };
              verifyBadgeHtml = ' ' + ContactVerify.renderBadge(vc, { showActions:false });
            }
          }
          // ── Contact cell (role as secondary line, compose/WA hover-reveal)
          const roleSubHtml = (e.role) ? '<span class="ol-contact-role-sub">'+olEsc(e.role)+'</span>' : '';
          html += '<td class="ol-td-contact"><div class="ol-contact-wrap">'+avatarHtml
            + '<span class="ol-contact-name-wrap">'+contactHtml+verifyBadgeHtml+roleSubHtml+'</span>'
            + '<span class="ol-hover-action">'+composeLink+waLink+'</span>'
            + '</div></td>';
          // ── Club cell (deal type + reason as compact pills if set)
          const clubUrl = _clubUrls[e.club] || '';
          const clubHtml = clubUrl
            ? '<a href="'+olEsc(clubUrl)+'" target="_blank" class="ol-club-link" onclick="event.stopPropagation()">'+olEsc(e.club)+'</a>'
            : olEsc(e.club);
          const dt = e.deal_type || '';
          const dtPill = dt ? '<span class="ol-deal-pill ol-deal-'+dt+'">'+(dt==='loan'?'Loan':'Permanent')+'</span>' : '';
          const reasonText = e.reason || '';
          const reasonPill = reasonText ? '<span class="ol-reason-pill" title="'+olEsc(reasonText)+'">'+olEsc(reasonText.length>18?reasonText.slice(0,17)+'…':reasonText)+'</span>' : '';
          html += '<td class="ol-td-club">'+clubHtml+dtPill+reasonPill+'</td>';
          // ── Status pill (click to open picker)
          const STATUS_LABEL_MAP = {queued:'Queued',contacted:'Contacted',in_talks:'In Talks',offered:'Offered',reject:'Rejected'};
          html += '<td class="ol-td-status"><span class="ol-status-pill ol-sp-'+displayStatus+'" onclick="event.stopPropagation();OutreachLog.openStatusPicker(\''+olEsc(e.id)+'\',this)" title="Click to change status">'+STATUS_LABEL_MAP[displayStatus]+'</span></td>';
          // ── Follow-up date picker
          html += '<td class="ol-td-fu"><input type="date" class="ol-fu-input'+(fuOverdue?' ol-fu-overdue':(fuSoon?' ol-fu-soon':''))+'" value="'+olEsc(fuVal)+'" data-id="'+olEsc(e.id)+'" onchange="OutreachLog.updateFollowUp(this.dataset.id,this.value)" title="Set follow-up date"></td>';
          // ── Notes: inline preview + add button
          const noteCount = userNotes.length;
          const latestNote = noteCount ? userNotes[noteCount-1].text : '';
          const notePreview = latestNote.length > 72 ? latestNote.slice(0,72)+'…' : latestNote;
          const moreBadge = noteCount > 1 ? '<span class="ol-notes-more">+'+(noteCount-1)+'</span>' : '';
          html += '<td class="ol-td-notes">'
            + (noteCount ? '<div class="ol-notes-preview" onclick="event.stopPropagation();OutreachLog.openNotesPop(\''+olEsc(e.id)+'\',this)">'+olEsc(notePreview)+moreBadge+'</div>' : '')
            + '<button class="ol-note-add-btn" onclick="event.stopPropagation();OutreachLog.openNotesPop(\''+olEsc(e.id)+'\',this)">'+(noteCount?'+ add':'+ note')+'</button>'
            + '</td>';
          // ── Remove (hover-reveal)
          html += '<td class="ol-td-remove"><button class="ol-remove ol-hover-action" onclick="OutreachLog.onRemove(\''+olEsc(e.id)+'\')" title="Remove">&times;</button></td>';
          html += '</tr>';
        });
      });

      html += '</tbody></table></div>';

      if (hasMore) {
        const remaining = entries.length - _visLimit;
        html += '<div class="ol-load-more">'
          + '<button class="ol-load-more-btn" onclick="OutreachLog.loadMore(\''+olEsc(cid)+'\')">Load '+Math.min(PAGE_SIZE, remaining)+' more</button>'
          + '<span class="ol-lm-info">Showing '+_visLimit+' of '+entries.length+'</span>'
          + '</div>';
      }
    }

    html += '</div>'; // ol-scroll-area

    // ── BULK ACTION BAR ──────────────────────────────────────────────
    html += '<div class="ol-bulk-bar">';
    html += '<span class="ol-bulk-count">0 selected</span>';
    html += '<select class="ol-bulk-select" onchange="if(this.value){OutreachLog.bulkSetStatus(\''+olEsc(cid)+'\',this.value);this.value=\'\';}">';
    html += '<option value="">Set status ▾</option>';
    html += '<option value="queued">Queued</option>';
    html += '<option value="contacted">Contacted</option>';
    html += '<option value="in_talks">In Talks</option>';
    html += '<option value="offered">Offered</option>';
    html += '<option value="reject">Rejected</option>';
    html += '</select>';
    html += '<button onclick="OutreachLog.emailSelected(\''+olEsc(cid)+'\')" id="ol-email-sel-'+cid+'">✉ Email</button>';
    html += '<button onclick="OutreachLog.bulkAppendNote(\''+olEsc(cid)+'\')">+ Note</button>';
    html += '<button onclick="OutreachLog.bulkSetFollowUp(\''+olEsc(cid)+'\')">📅 Follow-up</button>';
    html += '<button class="ol-bulk-close" onclick="OutreachLog.clearSelection(\''+olEsc(cid)+'\')">&times;</button>';
    html += '</div>'; // end bulk-bar

    html += '</div>'; // filter-main

    // Preserve scroll position across re-renders
    const _prevFm = document.getElementById('ol-fm-'+containerId);
    const _prevSa = _prevFm && _prevFm.querySelector('.ol-scroll-area');
    const _savedScroll = _prevSa ? _prevSa.scrollTop : 0;

    container.innerHTML = html;

    // Restore scroll position
    const _newFm = document.getElementById('ol-fm-'+containerId);
    const _newSa = _newFm && _newFm.querySelector('.ol-scroll-area');
    if (_newSa && _savedScroll > 0) _newSa.scrollTop = _savedScroll;

    initResize(cid);

    // Re-render on breakpoint crossing so table ↔ card layouts get correct colspans/widths.
    if (!_resizeHook) {
      _resizeHook = true;
      var _rt = null;
      window.addEventListener('resize', function() {
        clearTimeout(_rt);
        _rt = setTimeout(function(){
          if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
        }, 250);
      });
    }

    // Wire up autofill
    const afInput = document.getElementById('ol-af-'+containerId);
    const afDd = document.getElementById('ol-dd-'+containerId);
    const addBtn = document.getElementById('ol-add-'+containerId);

    if (afInput) {
      afInput.addEventListener('input', function() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(() => showSuggestions(afInput, afDd, containerId), 150);
      });
      afInput.addEventListener('focus', function() {
        if (afInput.value.length >= 2) showSuggestions(afInput, afDd, containerId);
      });
      document.addEventListener('click', function(ev) {
        if (afDd && !afDd.contains(ev.target) && ev.target !== afInput) {
          afDd.style.display = 'none';
        }
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', function() {
        if (!_selectedContact) {
          if (afInput) {
            afInput.style.borderColor = '#ef4444';
            afInput.placeholder = 'Select a contact from the dropdown first';
            setTimeout(function() { afInput.style.borderColor = ''; afInput.placeholder = 'Type contact name...'; }, 2000);
          }
          return;
        }
        const playerSel = document.getElementById('ol-player-sel-'+containerId);
        const player = (playerSel && playerSel.value) ? playerSel.value : (playerNames[0] || 'General');
        addEntry({
          player: player,
          contact: _selectedContact.name,
          role: _selectedContact.role,
          email: _selectedContact.email,
          phone: _selectedContact.phone || '',
          profile_url: _selectedContact.profile_url || '',
          club: _selectedContact.club,
          league: _selectedContact.league,
          country: _selectedContact.country,
          source: 'manual'
        });
        _selectedContact = null;
        if (afInput) { afInput.value = ''; afInput.classList.remove('ol-af-selected'); }
        render(containerId, opts);
      });
    }

    // Wire up inline editable cells (contact, role)
    container.addEventListener('blur', function(ev) {
      var el = ev.target;
      if (!el.classList || !el.classList.contains('ol-editable')) return;
      var id = el.dataset.id, field = el.dataset.field, value = (el.textContent || '').trim();
      if (value === '—') value = ''; // placeholder dash
      if (field === 'contact') updateContact(id, value);
      else if (field === 'role') updateRole(id, value);
    }, true); // useCapture so blur bubbles
    container.addEventListener('keydown', function(ev) {
      if (ev.target.classList && ev.target.classList.contains('ol-editable') && ev.key === 'Enter') {
        ev.preventDefault();
        ev.target.blur();
      }
    });

    // Wire up notes debounced save
    container.querySelectorAll('.ol-notes').forEach(input => {
      let noteTimer = null;
      input.addEventListener('input', function() {
        clearTimeout(noteTimer);
        const id = this.dataset.id;
        const val = this.value;
        noteTimer = setTimeout(() => updateNotes(id, val), 400);
      });
    });
  }

  function showSuggestions(input, dd, containerId) {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { dd.style.display = 'none'; return; }
    const matches = (_autofillList || []).filter(c =>
      c.name.toLowerCase().includes(q)
    ).slice(0, 8);
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map((c, i) =>
      '<div class="ol-af-item" data-idx="'+i+'">' +
      '<span class="ol-af-name">'+olEsc(c.name)+'</span>' +
      '<span class="ol-af-meta">'+olEsc(c.role)+' &middot; '+olEsc(c.club)+'</span>' +
      '</div>'
    ).join('');
    dd.style.display = 'block';
    dd.querySelectorAll('.ol-af-item').forEach((el, i) => {
      el.addEventListener('click', function() {
        _selectedContact = matches[i];
        input.value = matches[i].name + ' \u2014 ' + matches[i].club;
        input.classList.add('ol-af-selected');
        dd.style.display = 'none';
      });
    });
  }

  // ── Event handlers (called from inline onclick/onchange) ──
  function onStatusChange(id, sel) {
    updateStatus(id, sel.value);
    sel.className = 'ol-status ol-status-' + sel.value;
  }

  function onRemove(id) {
    removeEntry(id);
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function setFilter(containerId, type, value) {
    if (type === 'status') _filterStatus[containerId] = value;
    if (type === 'country') { _filterCountry[containerId] = value; _filterLeague[containerId] = ''; }
    if (type === 'league') _filterLeague[containerId] = value;
    _visibleCounts[containerId] = PAGE_SIZE; // reset pagination on filter change
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function setPlayerFilter(containerId, player) {
    _filterPlayerSel[containerId] = player;
    _visibleCounts[containerId] = PAGE_SIZE; // reset pagination
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function loadMore(cid) {
    _visibleCounts[cid] = (_visibleCounts[cid] || PAGE_SIZE) + PAGE_SIZE;
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function onPipelineContacted(id) {
    updateStatus(id, 'contacted');
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function emailPipeline(cid) {
    var checked = Array.prototype.slice.call(document.querySelectorAll('.ol-pipe-cb[data-cid="'+cid+'"]:checked'));
    var rows = [];
    checked.forEach(function(cb) {
      var emails = (cb.dataset.emails||'').split(',').filter(Boolean);
      var firstnames = (cb.dataset.firstnames||'').split(',');
      var player = cb.dataset.player || '';
      var club = cb.dataset.club || '';
      emails.forEach(function(email, idx) {
        rows.push({ email: email.trim(), player: player, firstName: (firstnames[idx]||'').trim(), club: club });
      });
    });
    if (!rows.length) {
      var btn = document.querySelector('#ol-pipeline-'+cid+' .ol-tool-btn');
      if (btn) { var orig = btn.textContent; btn.textContent = 'Select clubs first'; btn.style.color='#ef4444'; setTimeout(function(){ btn.textContent=orig; btn.style.color=''; }, 2000); }
      return;
    }
    var drafts = (_currentOpts && _currentOpts.drafts) || {};
    var anyDraft = rows.some(function(r) { var d = drafts[r.player]||{}; return !!(d.email_loan||d.email_permanent||d.email_followup); });
    var anchorBtn = document.querySelector('#ol-pipeline-'+cid+' .ol-tool-btn');
    if (anyDraft) {
      _showMassEmailPicker(rows, drafts, anchorBtn);
    } else {
      rows.forEach(function(r, i) {
        setTimeout(function() { window.open('mailto:'+encodeURI(r.email), '_blank'); }, i * 150);
      });
    }
  }

  function onPipelineGroupContacted(idsCsv) {
    idsCsv.split(',').forEach(function(id) { updateStatus(id.trim(), 'contacted'); });
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function onPipelineGroupRemove(idsCsv) {
    idsCsv.split(',').forEach(function(id) { removeEntry(id.trim()); });
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  // ── Mass email select ──
  function toggleAllCheckboxes(masterCb, cid) {
    var container = document.getElementById(cid);
    if (!container) return;
    container.querySelectorAll('.ol-row-cb').forEach(function(cb) { cb.checked = masterCb.checked; });
    updateBulkBar(cid);
  }

  function emailSelected(cid) {
    var container = document.getElementById(cid);
    if (!container) return;
    var checked = Array.prototype.slice.call(container.querySelectorAll('.ol-row-cb:checked'));
    var rows = checked.map(function(cb) {
      return { email: cb.dataset.email, player: cb.dataset.player || '', firstName: cb.dataset.firstname || '', club: cb.dataset.club || '' };
    }).filter(function(r) { return !!r.email; });
    var btn = document.getElementById('ol-email-sel-'+cid);
    if (!rows.length) {
      if (btn) { btn.textContent = 'None with email'; btn.style.color='#ef4444'; setTimeout(function(){ btn.textContent='✉ Email selected'; btn.style.color=''; }, 2000); }
      return;
    }
    var drafts = (_currentOpts && _currentOpts.drafts) || {};
    // Check if any selected row has a draft — if so, show picker
    var anyDraft = rows.some(function(r) { var d = drafts[r.player]||{}; return !!(d.email_loan||d.email_permanent||d.email_followup); });
    if (anyDraft) {
      _showMassEmailPicker(rows, drafts, btn);
    } else {
      rows.forEach(function(r, i) {
        setTimeout(function() { window.open('mailto:'+encodeURI(r.email), '_blank'); }, i * 150);
      });
      if (btn) { btn.textContent = '✉ Opened '+rows.length; btn.style.color='#16a34a'; setTimeout(function(){ btn.textContent='✉ Email selected'; btn.style.color=''; }, 2500); }
    }
  }

  function _showMassEmailPicker(rows, drafts, anchorBtn) {
    var existing = document.getElementById('ol-mass-email-pop');
    if (existing) { existing.remove(); return; }
    var pop = document.createElement('div');
    pop.id = 'ol-mass-email-pop';
    pop.className = 'ol-draft-pop';
    var html = '<div class="ol-draft-section-hdr">Open '+rows.length+' emails with draft:</div>';
    // Use first row's player to detect drafts (all selected likely same player)
    var firstPlayer = rows[0].player;
    var pd = drafts[firstPlayer] || {};
    if (pd.email_loan) {
      html += '<a class="ol-draft-opt" href="#" onclick="event.preventDefault();OutreachLog._openMassEmails('+JSON.stringify(rows)+',\'loan\');document.getElementById(\'ol-mass-email-pop\').remove()">📤 Loan draft</a>';
    }
    if (pd.email_permanent) {
      html += '<a class="ol-draft-opt" href="#" onclick="event.preventDefault();OutreachLog._openMassEmails('+JSON.stringify(rows)+',\'permanent\');document.getElementById(\'ol-mass-email-pop\').remove()">📤 Permanent draft</a>';
    }
    if (pd.email_followup) {
      html += '<a class="ol-draft-opt" href="#" onclick="event.preventDefault();OutreachLog._openMassEmails('+JSON.stringify(rows)+',\'followup\');document.getElementById(\'ol-mass-email-pop\').remove()">📩 Follow-up draft</a>';
    }
    html += '<a class="ol-draft-opt ol-draft-blank" href="#" onclick="event.preventDefault();OutreachLog._openMassEmails('+JSON.stringify(rows)+',\'blank\');document.getElementById(\'ol-mass-email-pop\').remove()">✉ Blank email</a>';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    if (anchorBtn) {
      var rect = anchorBtn.getBoundingClientRect();
      pop.style.top = (rect.bottom+4)+'px';
      pop.style.left = Math.max(4, rect.right-200)+'px';
    }
    setTimeout(function() {
      function outside(ev) { var p=document.getElementById('ol-mass-email-pop'); if(p&&!p.contains(ev.target)&&ev.target!==anchorBtn){p.remove();document.removeEventListener('click',outside);} }
      document.addEventListener('click', outside);
    }, 50);
  }

  function _openMassEmails(rows, draftType) {
    var drafts = (_currentOpts && _currentOpts.drafts) || {};
    rows.forEach(function(r, i) {
      setTimeout(function() {
        var pd = drafts[r.player] || {};
        var draft = draftType === 'loan' ? pd.email_loan : draftType === 'permanent' ? pd.email_permanent : draftType === 'followup' ? pd.email_followup : null;
        var url = draft ? buildMailtoHref(r.email, r.firstName, draft, r.club) : 'mailto:'+encodeURI(r.email);
        window.open(url, '_blank');
      }, i * 200);
    });
  }

  // ── Status labels (shared) ──
  const STATUS_LABELS = {queued:'Queued', contacted:'Contacted', in_talks:'In Talks', offered:'Offered', reject:'Rejected'};
  const STATUS_ORDER  = ['queued','contacted','in_talks','offered','reject'];

  // ── Set status: jump to any (replaces cycle) ──
  function setStatus(id, newStatus, el) {
    updateStatus(id, newStatus);
    if (el) {
      el.className = 'ol-status-pill ol-sp-' + newStatus;
      el.textContent = STATUS_LABELS[newStatus] || newStatus;
      const row = el.closest('tr') || el.closest('.ol-card');
      if (row) {
        row.className = row.className.replace(/\bol-s-\w+/g, '').trim() + ' ol-s-' + newStatus;
        const avatar = row.querySelector('.ol-avatar');
        const avatarColors = {queued:'#64748b', contacted:'#94a3b8', in_talks:'#22c55e', offered:'#16a34a', reject:'#ef4444'};
        if (avatar) avatar.style.background = avatarColors[newStatus] || '#94a3b8';
      }
    }
  }

  // ── Status picker popover ──
  function openStatusPicker(id, anchorEl) {
    const existing = document.getElementById('ol-status-pop');
    if (existing) { const wasMe = existing.dataset.forId === id; existing.remove(); if (wasMe) return; }
    const pop = document.createElement('div');
    pop.id = 'ol-status-pop';
    pop.className = 'ol-status-pop';
    pop.dataset.forId = id;
    pop.innerHTML = STATUS_ORDER.map(function(s) {
      return '<div class="ol-status-pop-opt ol-sp-'+s+'" data-status="'+s+'">'+STATUS_LABELS[s]+'</div>';
    }).join('');
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 4) + 'px';
    pop.style.left = Math.max(4, Math.min(rect.left, window.innerWidth - 160)) + 'px';
    pop.querySelectorAll('.ol-status-pop-opt').forEach(function(opt) {
      opt.addEventListener('click', function(ev) {
        ev.stopPropagation();
        setStatus(id, opt.dataset.status, anchorEl);
        pop.remove();
      });
    });
    setTimeout(function() {
      function outside(ev) {
        const p = document.getElementById('ol-status-pop');
        if (p && !p.contains(ev.target) && ev.target !== anchorEl) {
          p.remove();
          document.removeEventListener('click', outside);
        }
      }
      document.addEventListener('click', outside);
    }, 50);
  }

  // ── Compose = log: open mailto + auto-promote queued→contacted + auto-note ──
  function openMailto(id, href) {
    const entries = load();
    const e = entries.find(function(x){ return x.id === id; });
    if (e) {
      if (e.status === 'queued') updateStatus(id, 'contacted');
      if (!e.notes_log) e.notes_log = [];
      e.notes_log.push({date: new Date().toISOString(), text: '✉ Email opened', auto: true});
      save(entries);
    }
    window.open(href, '_blank');
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }
  function openWA(id, href) {
    const entries = load();
    const e = entries.find(function(x){ return x.id === id; });
    if (e) {
      if (e.status === 'queued') updateStatus(id, 'contacted');
      if (!e.notes_log) e.notes_log = [];
      e.notes_log.push({date: new Date().toISOString(), text: '💬 WhatsApp opened', auto: true});
      save(entries);
    }
    window.open(href, '_blank');
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  // ── "Needs Action" virtual filter helper ──
  function needsAction(e) {
    if (!e) return false;
    if (e.status === 'reject') return false;
    const today = new Date().toISOString().slice(0,10);
    if (e.follow_up && e.follow_up <= today) return true;
    if (e.status === 'queued') {
      const staleMs = Date.now() - new Date(e.date || 0).getTime();
      if (staleMs >= 3 * 86400000) return true;
    }
    return false;
  }

  // ── Panel resize ──────────────────────────────────────────────────────────
  function initResize(cid) {
    var handle = document.getElementById('fp-handle-'+cid);
    var panel  = document.getElementById('ol-fp-'+cid);
    if (!handle || !panel) return;

    var dragging = false, startX = 0, startW = 0, _collapsedW = null;

    handle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startW = panel.offsetWidth;
      handle.classList.add('ol-resizing');
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var newW = Math.max(50, Math.min(420, startW + (e.clientX - startX)));
      panel.style.width = newW + 'px';
    });

    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('ol-resizing');
      document.body.style.userSelect = '';
      var w = panel.style.width;
      _fpWidths[cid] = w;
      try { localStorage.setItem('fp_width_'+cid, w); } catch(ex) {}
    });

    // Double-click to collapse / expand
    handle.addEventListener('dblclick', function() {
      if (panel.offsetWidth > 60) {
        _collapsedW = panel.style.width || (panel.offsetWidth + 'px');
        panel.style.width = '0px';
        panel.style.overflow = 'hidden';
        _fpWidths[cid] = '0px';
        try { localStorage.setItem('fp_width_'+cid, '0px'); } catch(ex) {}
      } else {
        var restoreW = _collapsedW || '210px';
        panel.style.width = restoreW;
        panel.style.overflow = '';
        _fpWidths[cid] = restoreW;
        try { localStorage.setItem('fp_width_'+cid, restoreW); } catch(ex) {}
      }
    });
  }

  function clearFilters(cid) {
    _filterStatus[cid]  = '';
    _filterCountry[cid] = '';
    _filterLeague[cid]  = '';
    _visibleCounts[cid] = PAGE_SIZE; // reset pagination
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  // ── Selection & bulk ops ──
  function _selectedIds(cid) {
    const container = document.getElementById(cid);
    if (!container) return [];
    return Array.prototype.slice.call(container.querySelectorAll('.ol-row-cb:checked'))
      .map(function(cb){ return cb.dataset.id; }).filter(Boolean);
  }

  function toggleRowCheckbox(cid) {
    updateBulkBar(cid);
  }

  function updateBulkBar(cid) {
    const container = document.getElementById(cid);
    if (!container) return;
    const bar = container.querySelector('.ol-bulk-bar');
    if (!bar) return;
    const ids = _selectedIds(cid);
    if (ids.length) {
      bar.classList.add('active');
      const count = bar.querySelector('.ol-bulk-count');
      if (count) count.textContent = ids.length + ' selected';
    } else {
      bar.classList.remove('active');
    }
  }

  function bulkSetStatus(cid, newStatus) {
    const ids = _selectedIds(cid);
    if (!ids.length || !newStatus) return;
    ids.forEach(function(id){ updateStatus(id, newStatus); });
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function bulkAppendNote(cid) {
    const ids = _selectedIds(cid);
    if (!ids.length) return;
    const text = window.prompt('Note to add to ' + ids.length + ' selected:');
    if (!text || !text.trim()) return;
    ids.forEach(function(id){ appendNote(id, text.trim()); });
  }

  function bulkSetFollowUp(cid) {
    const ids = _selectedIds(cid);
    if (!ids.length) return;
    const date = window.prompt('Follow-up date (YYYY-MM-DD) for ' + ids.length + ' selected:',
      new Date(Date.now() + 7*86400000).toISOString().slice(0,10));
    if (!date) return;
    ids.forEach(function(id){ updateFollowUp(id, date); });
    if (_currentContainerId && _currentOpts) render(_currentContainerId, _currentOpts);
  }

  function clearSelection(cid) {
    const container = document.getElementById(cid);
    if (!container) return;
    container.querySelectorAll('.ol-row-cb').forEach(function(cb){ cb.checked = false; });
    const master = container.querySelector('.ol-th-cb input[type=checkbox]');
    if (master) master.checked = false;
    updateBulkBar(cid);
  }

  // ── Live text search (DOM filter, no re-render) ──
  function _onSearch(input, cid) {
    const q = (input.value || '').toLowerCase().trim();
    const fm = document.getElementById('ol-fm-'+cid);
    if (!fm) return;
    fm.querySelectorAll('tr.ol-row').forEach(function(tr) {
      tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none';
    });
    fm.querySelectorAll('tr.ol-league-hdr').forEach(function(hdr) {
      var next = hdr.nextElementSibling;
      var hasVisible = false;
      while (next && !next.classList.contains('ol-league-hdr')) {
        if (next.classList.contains('ol-row') && next.style.display !== 'none') hasVisible = true;
        next = next.nextElementSibling;
      }
      hdr.style.display = hasVisible ? '' : 'none';
    });
  }

  // ── Quick inline note (Enter to save) ──
  function quickNoteSave(id, inputEl) {
    const text = (inputEl.value || '').trim();
    if (!text) return;
    appendNote(id, text);
    inputEl.value = '';
  }

  // ── Public API ──
  return {
    load, save, addEntry, updateStatus, updateNotes, removeEntry,
    migrate, autoAddFromEmail, render, onStatusChange, onRemove,
    countryForLeague, buildContactsList, initFirebase, setFilter,
    setPlayerFilter, addToPipeline, emailPipeline, onPipelineContacted, onPipelineGroupContacted, onPipelineGroupRemove, isInPipeline, removeFromPipeline,
    appendNote, updateFollowUp, updateContact, updateRole, updateDealType, exportCSV, openNotesPop,
    toggleAllCheckboxes, emailSelected, openDraftPicker, openWAPicker, _openMassEmails,
    initResize, clearFilters,
    setStatus, openStatusPicker, openMailto, openWA, needsAction,
    bulkSetStatus, bulkAppendNote, bulkSetFollowUp, clearSelection, toggleRowCheckbox,
    quickNoteSave, _onSearch, loadMore
  };
})();
