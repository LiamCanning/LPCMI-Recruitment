// View-state persistence — survives Cmd+R / Cmd+Shift+R on every page.
// Snapshots: scroll position, all named inputs/selects, and the expanded
// /collapsed state of every .staff-card and .league-section with an id.
// Restores after render. Per-pathname key, sessionStorage-scoped (per tab).
(function () {
  var KEY = 'lp_state:' + location.pathname;

  function snapshot() {
    var s = { scroll: window.scrollY, hash: location.hash, inputs: {}, cards: {} };
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') s.inputs[el.id] = { c: el.checked };
      else s.inputs[el.id] = { v: el.value };
    });
    document.querySelectorAll('.staff-card[id], .league-section[id]').forEach(function (el) {
      var cls = '';
      if (el.classList.contains('expanded')) cls += 'E';
      if (el.classList.contains('collapsed')) cls += 'C';
      s.cards[el.id] = cls;
    });
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  function load() {
    try { var r = sessionStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {}
    return null;
  }

  function restoreInputs(s) {
    Object.keys(s.inputs || {}).forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      var v = s.inputs[id];
      if ('c' in v) {
        if (el.checked !== v.c) {
          el.checked = v.c;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (el.value !== v.v) {
        el.value = v.v;
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  // Restore card states. Returns true once every recorded id has been found
  // in the DOM (i.e. the renderer has produced the cards).
  function restoreCards(s) {
    var ids = Object.keys(s.cards || {});
    if (!ids.length) return true;
    var seen = 0;
    ids.forEach(function (id) {
      var el = document.getElementById(id); if (!el) return;
      seen++;
      var want = s.cards[id];
      el.classList.toggle('expanded',  want.indexOf('E') >= 0);
      el.classList.toggle('collapsed', want.indexOf('C') >= 0);
    });
    return seen >= ids.length;
  }

  function attemptRestore(s) {
    restoreInputs(s);
    var tries = 0;
    function go() {
      var done = restoreCards(s);
      if (done) {
        window.scrollTo(0, s.scroll || 0);
        return;
      }
      tries++;
      if (tries < 60) setTimeout(go, 50);            // up to ~3s for slow renderers
      else window.scrollTo(0, s.scroll || 0);
    }
    requestAnimationFrame(go);
  }

  // Save on unload, on pagehide (mobile/bfcache), and every 3s as a safety net.
  window.addEventListener('beforeunload', snapshot);
  window.addEventListener('pagehide', snapshot);
  setInterval(snapshot, 3000);

  function start() { var s = load(); if (s) attemptRestore(s); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
