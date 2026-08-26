/* app.js — Candidacy Exam Scheduler
   Roles: admin (whole event) and faculty (one availability grid, one link).
   Everything is a pure function of the Firebase data, so all browsers agree. */
(function () {
'use strict';

/* ===================================================================== utils */

var Admin = window.Admin = window.Admin || {};
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
    else el.setAttribute(k, v === true ? '' : v);
  });
  (kids || []).forEach(function (k) {
    if (k === null || k === undefined || k === false) return;
    el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  });
  return el;
}

function toast(msg, ms) {
  var t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.hidden = true; }, ms || 2600);
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

function fmtTime(min) {
  var hh = Math.floor(min / 60), mm = min % 60, ap = hh >= 12 ? 'pm' : 'am';
  var h12 = hh % 12 === 0 ? 12 : hh % 12;
  return h12 + (mm ? ':' + String(mm).padStart(2, '0') : '') + ap;
}
var DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var DOWFULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDay(key) {
  var d = Solver.parseYmd(key);
  return DOWS[d.getDay()] + ' ' + MONS[d.getMonth()] + ' ' + d.getDate();
}
function fmtDayLong(key) {
  var d = Solver.parseYmd(key);
  return DOWS[d.getDay()] + ', ' + MONS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}
function token() {
  var a = new Uint8Array(9);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.prototype.map.call(a, function (b) { return 'abcdefghjkmnpqrstuvwxyz23456789'[b % 30]; }).join('');
}
function sha(s) {
  // small non-crypto digest, enough to gate an admin tab on a private link
  var h1 = 0x811c9dc5, h2 = 0x1000193;
  for (var i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519); }
  return ((h1 >>> 0).toString(16) + (h2 >>> 0).toString(16));
}
function debounce(fn, ms) {
  var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
}
function copyText(s) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(s);
  var ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = s;
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}

/* ================================================================ app state */

var DEFAULT_SETTINGS = {
  startDate: '2026-10-01', endDate: '2026-11-30',
  dayStartMin: 9 * 60, dayEndMin: 17 * 60,
  slotStepMin: 60, durationMin: 90,
  weekdaysOnly: true,
  excludeDates: ['2026-11-26', '2026-11-27']
};

var S = {
  db: null, root: '', eventId: '2026',
  data: { meta: null, settings: null, faculty: {}, exams: {}, avail: {}, confirmed: {} },
  prevSuggestion: {},
  role: null,        // 'admin' | 'board'
  ptab: 'me',        // board tab: me | schedule | people
  me: null,          // faculty id when role==='faculty'
  tab: 'dash',
  res: null,         // last solve result
  connected: false,
  loaded: false,
  stream: null,
  showHelp: true,
  pendingDays: {}    // local unsaved availability edits
};

/* Everything lives under candidacy/<eventId>, so a second id is a second,
   completely separate board. ?event=<id> overrides config for one visit. */
function resolveEventId() {
  var m = /[?&]event=([A-Za-z0-9_-]{1,32})/.exec(location.search);
  if (m) return m[1];
  return (window.APP_CONFIG && window.APP_CONFIG.eventId) || '2026';
}
function isRehearsal() { return S.eventId !== '2026'; }

function dbUrl() {
  return (window.APP_CONFIG && window.APP_CONFIG.databaseURL) || localStorage.getItem('cs.db') || '';
}
function setDbUrl(u) { localStorage.setItem('cs.db', u.replace(/\/+$/, '')); }

function settings() { return Object.assign({}, DEFAULT_SETTINGS, S.data.settings || {}); }
function surname(name) {
  var p = String(name || '').trim().split(/\s+/);
  return (p[p.length - 1] || '').toLowerCase();
}
function facList() {
  // Sorted by surname — that is how people look for themselves in a faculty list.
  return Object.keys(S.data.faculty || {}).map(function (id) {
    return Object.assign({ id: id }, S.data.faculty[id]);
  }).sort(function (a, b) {
    return surname(a.name).localeCompare(surname(b.name)) || (a.name || '').localeCompare(b.name || '');
  });
}
function examList() {
  return Object.keys(S.data.exams || {}).map(function (id) {
    return Object.assign({ id: id }, S.data.exams[id]);
  }).sort(function (a, b) { return (a.last || '').localeCompare(b.last || ''); });
}
function facName(id) { var f = S.data.faculty[id]; return f ? f.name : id; }
function examName(e) { return (e.first ? e.first + ' ' : '') + (e.last || ''); }
function submitted(fid) { var a = S.data.avail[fid]; return !!(a && a.submitted); }

/* ============================================================== solve cycle */

function currentSolve() {
  var st = settings();
  var exams = examList().map(function (e) {
    return { id: e.id, members: e.members || [], blackouts: e.blackouts || [], prefer: e.prefer || null };
  });
  // Faculty who have not submitted are treated as having no availability, so a
  // schedule is never invented on their behalf.
  var avail = {};
  Object.keys(S.data.avail || {}).forEach(function (fid) {
    var a = S.data.avail[fid];
    if (a && a.submitted && a.days) avail[fid] = a.days;
  });
  return Solver.solve({ settings: st, exams: exams, avail: avail,
    confirmed: S.data.confirmed || {}, prev: S.prevSuggestion || {}, timeBudgetMs: 900 });
}

function inputHash() {
  var st = settings();
  // meta is in here so a title or passphrase change redraws too, even though
  // neither feeds the solver
  var parts = [JSON.stringify(st), JSON.stringify(S.data.meta || null)];
  examList().forEach(function (e) { parts.push(e.id + ':' + (e.members || []).join(',') + ':' + JSON.stringify(e.blackouts || [])); });
  Object.keys(S.data.avail || {}).sort().forEach(function (f) {
    var a = S.data.avail[f];
    if (a && a.submitted) parts.push('A' + f + ':' + JSON.stringify(a.days || {}));
  });
  Object.keys(S.data.confirmed || {}).sort().forEach(function (k) { parts.push('C' + k + ':' + JSON.stringify(S.data.confirmed[k])); });
  return Solver.hashStr(parts.join('|')).toString(36);
}

function pendingCount() {
  // exams that can't even be evaluated because a member hasn't submitted
  var n = 0;
  examList().forEach(function (e) {
    if ((e.members || []).some(function (m) { return !submitted(m); })) n++;
  });
  return n;
}

/* Nothing to publish any more. A booking is only real once the organiser
   confirms it, and confirmations live in the database, so every browser derives
   the same board from the same data. The solver's proposal is advisory and
   never written. */
function resolveAndRender() {
  if (!S.loaded) return;
  lastSig = inputHash();
  S.res = currentSolve();
  S.prevSuggestion = S.res.suggestion;      // keeps proposals stable between renders
  render();
}

/* The one link everyone opens. */
function shareLink() {
  return location.origin + location.pathname + '#/people';
}

/* ================================================================ live wire */

function connect() {
  var url = dbUrl();
  if (!url) { Admin.renderSetup(); return; }
  S.db = wrapWrites(new FB(url));
  S.eventId = resolveEventId();
  S.root = 'candidacy/' + S.eventId;

  S.db.get(S.root).then(function (data) {
    ingest(data || {});
    S.loaded = true;
    resolveAndRender();
    startStream();
    watchVisibility();
  }).catch(function (e) {
    S.loaded = true;
    renderError(e);
  });
}

/* Every write also lands in the local tree straight away, so the UI reacts to
   your own action without waiting for the server to echo it back. */
function wrapWrites(d) {
  var rawPut = d.put.bind(d), rawPatch = d.patch.bind(d), rawDel = d.del.bind(d);
  function rel(path) {
    var p = String(path || '');
    if (p.indexOf(S.root) === 0) p = p.slice(S.root.length);
    return p.replace(/^\/+|\/+$/g, '');
  }
  function descend(obj, seg) {
    for (var i = 0; i < seg.length - 1; i++) {
      if (typeof obj[seg[i]] !== 'object' || obj[seg[i]] === null) obj[seg[i]] = {};
      obj = obj[seg[i]];
    }
    return obj;
  }
  function setLocal(path, val, isPatch) {
    var parts = rel(path).split('/').filter(Boolean);
    if (!parts.length) {
      if (!isPatch) ingest(val || {});
      else Object.keys(val || {}).forEach(function (k) { S.data[k] = val[k]; });
      return;
    }
    var cur = descend(S.data, parts), last = parts[parts.length - 1];
    if (!isPatch) {
      if (val === null) delete cur[last]; else cur[last] = val;
      return;
    }
    if (typeof cur[last] !== 'object' || cur[last] === null) cur[last] = {};
    Object.keys(val || {}).forEach(function (k) {
      var seg = k.split('/').filter(Boolean);           // patch keys may be paths
      var c2 = descend(cur[last], seg), lk = seg[seg.length - 1];
      if (val[k] === null) delete c2[lk]; else c2[lk] = val[k];
    });
  }
  d.put = function (p, v) { return rawPut(p, v).then(function (r) { setLocal(p, v, false); rerender(); return r; }); };
  d.patch = function (p, o) { return rawPatch(p, o).then(function (r) { setLocal(p, o, true); rerender(); return r; }); };
  d.del = function (p) { return rawDel(p).then(function (r) { setLocal(p, null, false); rerender(); return r; }); };
  return d;
}

function ingest(data) {
  S.data.meta = data.meta || null;
  S.data.settings = data.settings || null;
  S.data.faculty = data.faculty || {};
  S.data.exams = data.exams || {};
  S.data.avail = data.avail || {};
  S.data.confirmed = data.confirmed || {};
}

var lastSig = null;
var rerender = debounce(function again() {
  if (S.painting || !$('#modal').hidden) { setTimeout(again, 400); return; }
  // Streams re-send unchanged snapshots; only pay for a solve + redraw when
  // something that actually feeds the schedule has moved.
  var sig = inputHash();
  if (sig === lastSig) return;
  lastSig = sig;
  resolveAndRender();
}, 250);

/* Firebase's free tier allows 100 simultaneous connections. Nobody needs a live
   socket for a tab they walked away from, so park the stream while hidden and
   catch up with a plain read on return. */
function watchVisibility() {
  var idleTimer = null, IDLE = 5 * 60 * 1000;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      idleTimer = setTimeout(function () {
        if (S.stream) { S.stream.close(); S.stream = null; }
      }, IDLE);
      return;
    }
    clearTimeout(idleTimer);
    if (S.stream) return;
    S.db.get(S.root).then(function (data) {
      ingest(data || {});
      startStream();
      resolveAndRender();
    }).catch(function () { startStream(); });
  });
}

function startStream() {
  if (S.stream) return;
  S.stream = S.db.stream(S.root, function (ev) {
    var tree = {
      meta: S.data.meta, settings: S.data.settings, faculty: S.data.faculty,
      exams: S.data.exams, avail: S.data.avail, confirmed: S.data.confirmed
    };
    var next = FB.applyEvent(tree, ev);
    ingest(next || {});
    rerender();
  }, function (state) {
    S.connected = (state === 'open');
    var d = $('#conn-dot');
    if (d) d.className = 'dot ' + (S.connected ? 'live' : 'off');
    var l = $('#conn-label');
    if (l) l.textContent = S.connected ? 'live' : 'reconnecting…';
  });
}

/* ================================================================= routing */

var PTABS = [['me', 'My availability'], ['schedule', 'Schedule'], ['people', 'Faculty']];

function knownFaculty(id) { return !!(id && S.data.faculty && S.data.faculty[id]); }

function setMe(fid) {
  S.me = fid || null;
  S.pendingDays = {};
  if (fid) localStorage.setItem('cs.me', fid); else localStorage.removeItem('cs.me');
}

function route() {
  var hash = (location.hash || '').replace(/^#\/?/, '');
  var parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'admin') {
    S.role = 'admin';
    S.tab = parts[1] || S.tab || 'dash';
    return;
  }

  // Everyone else shares one link. Identity is a local choice, not a credential.
  if (!knownFaculty(S.me)) {
    var saved = localStorage.getItem('cs.me');
    S.me = knownFaculty(saved) ? saved : null;
  }

  if (parts[0] === 'f' && parts[1]) {                      // older per-person links
    var tok = parts[1];
    var fid = Object.keys(S.data.faculty).filter(function (id) {
      return id === tok || S.data.faculty[id].token === tok;
    })[0];
    if (fid) { setMe(fid); location.replace('#/me'); }
    S.role = 'board'; S.ptab = 'me';
    return;
  }

  S.role = 'board';
  var want = parts[0];
  if (!PTABS.some(function (t) { return t[0] === want; })) want = S.me ? 'me' : 'people';
  if (want === 'me' && !S.me) want = 'people';
  S.ptab = want;
}

window.addEventListener('hashchange', function () { route(); render(); });

/* ================================================================== render */

function render() {
  route();
  closeNameMenu();
  var app = $('#app');
  var keepY = window.scrollY;
  app.textContent = '';
  if (!dbUrl()) { Admin.renderSetup(); return; }
  if (!S.loaded) { app.appendChild(h('div', { class: 'boot', text: 'Connecting…' })); return; }

  if (S.role === 'admin' && !Admin.ok()) { app.appendChild(Admin.gate()); return; }

  app.appendChild(topbar());
  var wrap = h('div', { class: 'wrap wide' });
  app.appendChild(wrap);
  if (S.role === 'board') boardView(wrap);
  else Admin.view(wrap);
  if (keepY) window.scrollTo(0, keepY);
}

/* A name picker that drops out of the header, so you can jump to anyone's
   availability from any tab without going back to the Faculty list. */
function closeNameMenu() {
  var m = $('#name-menu');
  if (m) m.remove();
  document.removeEventListener('keydown', nameMenuKey);
  document.removeEventListener('mousedown', nameMenuAway);
}
function nameMenuKey(ev) { if (ev.key === 'Escape') closeNameMenu(); }
function nameMenuAway(ev) {
  var m = $('#name-menu');
  if (!m) return;
  // the target can be a text node or document itself, neither of which has closest()
  var t = ev.target;
  var el = (t && t.nodeType === 1) ? t : (t && t.parentElement);
  if (m.contains(t)) return;
  if (el && el.closest && el.closest('.namebtn')) return;
  closeNameMenu();
}

function openNameMenu(anchor) {
  if ($('#name-menu')) { closeNameMenu(); return; }
  var facs = facList();

  var list = h('div', { class: 'menu-list' });
  function draw(q) {
    list.textContent = '';
    var shown = facs.filter(function (f) { return !q || f.name.toLowerCase().indexOf(q) >= 0; });
    if (!shown.length) { list.appendChild(h('div', { class: 'sub', style: 'padding:.6rem', text: 'No match' })); return; }
    shown.forEach(function (f) {
      list.appendChild(h('button', {
        class: 'menu-item' + (f.id === S.me ? ' is-me' : ''),
        onclick: function () {
          if (f.id !== S.me && submitted(f.id) &&
              !confirm(f.name + ' has already submitted.\n\nOpen their availability? Only change it if you are ' + f.name + '.')) return;
          closeNameMenu();
          setMe(f.id);
          location.hash = '#/me';
          render();
        }
      }, [
        h('span', { text: f.name }),
        h('span', { class: 'spacer' }),
        submitted(f.id) ? h('span', { class: 'pill ok', text: '✓' }) : h('span', { class: 'pill bad', text: '—' })
      ]));
    });
  }
  draw('');

  var menu = h('div', { id: 'name-menu', class: 'menu' }, [
    h('input', { type: 'text', class: 'menu-filter', placeholder: 'Type to find your name…',
      oninput: function (ev) { draw(ev.target.value.toLowerCase().trim()); } }),
    list,
    h('div', { class: 'menu-foot sub', text: '✓ submitted · — not yet' })
  ]);

  document.body.appendChild(menu);
  var r = anchor.getBoundingClientRect();
  var w = Math.min(320, window.innerWidth - 16);
  menu.style.width = w + 'px';
  menu.style.top = (r.bottom + 6) + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  setTimeout(function () {
    var f = menu.querySelector('.menu-filter');
    if (f && window.innerWidth > 640) f.focus();
    document.addEventListener('keydown', nameMenuKey);
    document.addEventListener('mousedown', nameMenuAway);
  }, 0);
}

function topbar() {
  var st = settings();
  var right = [];
  if (S.role === 'admin') {
    right.push(h('button', { class: 'btn sm ghost', onclick: function () { location.hash = '#/'; }, text: 'Exit admin' }));
  } else if (S.me) {
    right.push(h('span', { class: 'whoami' }, [
      h('span', { class: 'sub', text: 'You are ' }),
      h('b', { text: facName(S.me) }),
      h('button', { class: 'btn sm ghost namebtn', text: 'switch ▾',
        onclick: function (ev) { openNameMenu(ev.currentTarget); } })
    ]));
  } else {
    right.push(h('button', { class: 'btn sm primary namebtn', text: 'Choose your name ▾',
      onclick: function (ev) { openNameMenu(ev.currentTarget); } }));
  }
  return h('div', { class: 'topbar' }, [
    h('div', { class: 'topbar-in' }, [
      h('div', { class: 'brand' }, [
        document.createTextNode((S.data.meta && S.data.meta.title) || 'Candidacy Exam Scheduling'),
        h('small', { text: fmtDay(st.startDate).replace(/^\w+ /, '') + ' – ' + fmtDay(st.endDate).replace(/^\w+ /, '') })
      ]),
      isRehearsal() ? h('span', { class: 'pill bad', title: 'Separate practice board — not the real schedule', text: S.eventId.toUpperCase() }) : null,
      h('span', { class: 'conn' }, [h('i', { id: 'conn-dot', class: 'dot ' + (S.connected ? 'live' : '') }), h('span', { id: 'conn-label', text: S.connected ? 'live' : 'connecting…' })])
    ].concat(right))
  ]);
}

/* The single source of truth for how an exam is doing.
     confirmed — a time is booked
     ready     — at least one time works for all three, right now
     waiting   — someone on the committee has not submitted
     stuck     — everyone submitted and nothing works, or everything that worked
                 has been taken by another booking */
function examStatus(e) {
  var res = S.res;
  var bk = res.confirmed[e.id];
  if (bk) return { kind: 'confirmed', slot: bk };
  var missing = (e.members || []).filter(function (m) { return !submitted(m); });
  var opts = res.options[e.id] || [];
  if (opts.length) return { kind: 'ready', options: opts, missing: missing };
  if (missing.length) return { kind: 'waiting', missing: missing };
  var common = (res.diag[e.id] || {}).common || 0;
  return { kind: 'stuck', options: [], squeezed: common > 0, common: common };
}

function warningFor(id) {
  var list = (S.res && S.res.bookingWarnings) || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function statusPill(e) {
  var st = examStatus(e);
  if (st.kind === 'confirmed') {
    var w = warningFor(e.id);
    return h('span', { class: 'pill ' + (w ? 'bad' : 'ok'), title: w ? bookingWarningText(w) : '',
      text: fmtDay(st.slot.dayKey) + ' · ' + fmtTime(st.slot.startMin) + (w ? ' ⚠' : '') });
  }
  if (st.kind === 'ready') {
    return h('span', { class: 'pill warn', text: st.options.length + ' time' + (st.options.length === 1 ? '' : 's') + ' work — not booked' });
  }
  if (st.kind === 'waiting') {
    return h('span', { class: 'pill mute', text: 'waiting on ' + st.missing.map(function (m) { return m === S.me ? 'you' : facName(m); }).join(', ') });
  }
  return h('span', { class: 'pill bad', text: st.squeezed ? 'all workable times taken' : 'no time works for all three' });
}

function progressCard() {
  var exams = examList(), total = exams.length;
  var n = { confirmed: 0, ready: 0, waiting: 0, stuck: 0 };
  exams.forEach(function (e) { n[examStatus(e).kind]++; });
  var pct = total ? Math.round(n.confirmed / total * 100) : 0;
  var readyPct = total ? Math.round((n.confirmed + n.ready) / total * 100) : 0;
  var facs = facList(), sub = facs.filter(function (f) { return submitted(f.id); }).length;

  return h('div', { class: 'card' }, [
    h('div', { class: 'bigstat' }, [
      h('div', {}, [h('b', { text: n.confirmed + ' / ' + total }), h('span', { text: 'exams booked' })]),
      h('div', {}, [h('b', { class: n.ready ? 'accentnum' : '', text: String(n.ready) }), h('span', { text: 'ready to book' })]),
      h('div', {}, [h('b', { text: String(n.waiting) }), h('span', { text: 'waiting on a reply' })]),
      h('div', {}, [h('b', { text: String(n.stuck) }), h('span', { text: 'no time works' })]),
      h('div', {}, [h('b', { text: sub + ' / ' + facs.length }), h('span', { text: 'faculty submitted' })])
    ]),
    h('div', { class: 'progress stacked', style: 'margin-top:12px' }, [
      h('i', { style: 'width:' + pct + '%' }),
      h('u', { style: 'width:' + Math.max(0, readyPct - pct) + '%' })
    ]),
    h('p', { class: 'sub', style: 'margin:.5rem 0 0', text:
      n.confirmed + ' booked' + (n.ready ? ', ' + n.ready + ' more could be booked now' : '') +
      (n.waiting ? ', ' + n.waiting + ' still waiting on someone' : '') +
      (n.stuck ? ', ' + n.stuck + ' with no workable time' : '') + '.' })
  ]);
}

/* Why a booking that was fine when it was made no longer holds. */
function bookingWarningText(w) {
  var bits = [];
  if (w.blocked) bits.push('it falls in the student’s blocked time');
  var never = w.notFree.filter(function (m) { return !submitted(m); });
  var busy = w.notFree.filter(function (m) { return submitted(m); });
  if (never.length) bits.push(never.map(facName).join(' and ') + (never.length === 1 ? ' has' : ' have') + ' not submitted availability');
  if (busy.length) bits.push(busy.map(facName).join(' and ') + (busy.length === 1 ? ' is' : ' are') + ' not free then');
  return bits.join('; ');
}

/* A short human summary of an exam's special considerations, for the board. */
function considerationText(e) {
  var out = (e.blackouts || []).map(function (b) {
    var when = b.dow != null
      ? 'no ' + DOWFULL[b.dow] + 's'
      : (b.from === b.to ? 'not ' + fmtDay(b.from) : 'not ' + fmtDay(b.from) + '–' + fmtDay(b.to));
    var t = (b.fromMin != null || b.toMin != null)
      ? ' ' + fmtTime(b.fromMin != null ? b.fromMin : 0) + '–' + fmtTime(b.toMin != null ? b.toMin : 1440) : '';
    return (b.label ? b.label + ' (' + when + t + ')' : when + t);
  });
  if (e.prefer) out.push(e.prefer === 'late' ? 'prefers late in the period' : 'prefers early in the period');
  if (e.note) out.push(e.note);
  return out.join(' · ');
}

/* ========================================================== board view ==== */

function myExams() {
  if (!S.me) return [];
  return examList().filter(function (e) { return (e.members || []).indexOf(S.me) >= 0; });
}

function boardView(wrap) {
  wrap.appendChild(h('div', { class: 'tabs' }, PTABS.map(function (t) {
    var label = t[1];
    if (t[0] === 'me' && S.me) {
      var mine = myExams(), placed = mine.filter(function (e) { return S.res.confirmed[e.id]; }).length;
      label = 'My availability';
      if (mine.length) label += ' (' + placed + '/' + mine.length + ')';
    }
    return h('button', { 'aria-selected': S.ptab === t[0] ? 'true' : 'false', text: label,
      onclick: function () { location.hash = '#/' + t[0]; } });
  })));
  var body = h('div');
  wrap.appendChild(body);
  body.appendChild(progressCard());
  ({ me: tabMe, schedule: tabSchedule, people: tabPeople }[S.ptab] || tabPeople)(body);
}

/* ---------------------------------------------------------- tab: schedule */

function tabSchedule(body) {
  var exams = examList();
  var groups = { confirmed: [], ready: [], waiting: [], stuck: [] };
  exams.forEach(function (e) { groups[examStatus(e).kind].push(e); });

  /* --- booked --- */
  if (groups.confirmed.length) {
    var byDay = {};
    groups.confirmed.forEach(function (e) {
      var sl = S.res.confirmed[e.id];
      (byDay[sl.dayKey] = byDay[sl.dayKey] || []).push({ e: e, s: sl });
    });
    var card = h('div', { class: 'card' }, [
      h('h2', { text: 'Booked (' + groups.confirmed.length + ')' }),
      h('p', { class: 'sub', text: 'These times are fixed. Put them in your calendar.' })
    ]);
    Object.keys(byDay).sort().forEach(function (k) {
      var list = byDay[k].sort(function (a, b) { return a.s.startMin - b.s.startMin; });
      card.appendChild(h('h3', { style: 'margin:1.1rem 0 .3rem;color:var(--muted)', text: fmtDayLong(k) }));
      card.appendChild(h('table', { class: 'data', style: 'width:100%' }, [
        h('tbody', {}, list.map(function (x) {
          var isMine = S.me && (x.e.members || []).indexOf(S.me) >= 0;
          return h('tr', {}, [
            h('td', { style: 'white-space:nowrap;width:1%' }, [h('b', { text: fmtTime(x.s.startMin) + ' – ' + fmtTime(x.s.endMin) })]),
            h('td', {}, [
              h('b', { text: examName(x.e) }),
              isMine ? h('span', { class: 'pill ok', style: 'margin-left:.5rem', text: 'yours' }) : null,
              considerationText(x.e) ? h('div', { class: 'sub', style: 'font-style:italic', text: considerationText(x.e) }) : null
            ]),
            h('td', { class: 'sub', text: (x.e.members || []).map(facName).join(', ') })
          ]);
        }))
      ]));
    });
    body.appendChild(card);
  }

  /* --- could be booked now --- */
  if (groups.ready.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Ready to book (' + groups.ready.length + ')' }),
      h('p', { class: 'sub', text: 'All three members are free at these times. The organiser picks one and confirms it — nothing here is fixed yet.' }),
      h('ul', { class: 'clean' }, groups.ready.map(function (e) {
        var opts = (S.res.options[e.id] || []);
        var shown = orderedOptions(e, opts).slice(0, 4);
        return h('li', {}, [
          h('div', { class: 'row' }, [
            h('b', { text: examName(e) }),
            mineTag(e),
            h('span', { class: 'spacer' }),
            h('span', { class: 'pill warn', text: opts.length + ' possible time' + (opts.length === 1 ? '' : 's') })
          ]),
          h('div', { class: 'sub', text: (e.members || []).map(facName).join(', ') }),
          h('div', { class: 'sub', style: 'margin-top:.15rem' }, [
            document.createTextNode('e.g. ' + shown.map(function (sid) {
              var sl = S.res.slots[sid];
              return fmtDay(sl.dayKey) + ' ' + fmtTime(sl.startMin);
            }).join(' · ') + (opts.length > shown.length ? ' …' : ''))
          ]),
          considerationText(e) ? h('div', { class: 'sub', style: 'font-style:italic', text: considerationText(e) }) : null
        ]);
      }))
    ]));
  }

  /* --- blocked --- */
  var blocked = groups.waiting.concat(groups.stuck);
  if (blocked.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Not bookable yet (' + blocked.length + ')' }),
      h('ul', { class: 'clean' }, blocked.map(function (e) {
        return h('li', {}, [
          h('div', { class: 'row' }, [
            h('b', { text: examName(e) }), mineTag(e),
            h('span', { class: 'sub', text: (e.members || []).map(facName).join(', ') }),
            h('span', { class: 'spacer' }), statusPill(e)
          ]),
          considerationText(e) ? h('div', { class: 'sub', style: 'font-style:italic', text: considerationText(e) }) : null
        ]);
      }))
    ]));
  }

  if (!exams.length) body.appendChild(h('div', { class: 'card empty', text: 'No exams yet.' }));
}

function mineTag(e) {
  return (S.me && (e.members || []).indexOf(S.me) >= 0)
    ? h('span', { class: 'pill ok', text: 'yours' }) : null;
}

/* Option ordering honours the student's stated preference. */
function orderedOptions(e, opts) {
  var slots = S.res.slots, out = opts.slice();
  out.sort(function (a, b) {
    var A = slots[a], B = slots[b];
    if (A.dayKey !== B.dayKey) return A.dayKey < B.dayKey ? -1 : 1;
    return A.startMin - B.startMin;
  });
  if (e.prefer === 'late') out.reverse();
  return out;
}

/* ----------------------------------------------------------- tab: faculty */

function tabPeople(body) {
  var res = S.res, facs = facList(), cpd = res.cpd, totalCells = res.days.length * cpd;

  if (!S.me) {
    body.appendChild(h('div', { class: 'hint' }, [
      h('b', { text: 'Find your name below. ' }),
      document.createTextNode('Clicking it opens your availability grid — no password, no personal link.')
    ]));
  }

  var filter = h('input', { type: 'text', placeholder: 'Type to find a name…', style: 'width:100%;max-width:320px',
    oninput: function (ev) {
      var q = ev.target.value.toLowerCase();
      $$('#people-rows tr').forEach(function (tr) {
        tr.style.display = !q || tr.dataset.name.indexOf(q) >= 0 ? '' : 'none';
      });
    } });

  var rows = facs.map(function (f) {
    var a = S.data.avail[f.id], open = 0;
    if (a && a.days) res.days.forEach(function (d) {
      var row = a.days[d.key] || '';
      for (var i = 0; i < row.length; i++) if (row[i] === '1') open++;
    });
    var pct = totalCells ? Math.round(open / totalCells * 100) : 0;
    var mine = examList().filter(function (e) { return (e.members || []).indexOf(f.id) >= 0; });
    var placed = mine.filter(function (e) { return res.confirmed[e.id]; }).length;
    var isMe = f.id === S.me;
    return h('tr', { dataset: { name: f.name.toLowerCase() }, style: isMe ? 'background:color-mix(in srgb,var(--ok) 10%,transparent)' : '' }, [
      h('td', {}, [h('b', { text: f.name }), isMe ? h('span', { class: 'sub', text: '  (you)' }) : null]),
      h('td', {}, [submitted(f.id) ? h('span', { class: 'pill ok', text: 'submitted' }) : h('span', { class: 'pill bad', text: 'not yet' })]),
      h('td', { class: 'num sub', text: submitted(f.id) ? pct + '% open' : '—' }),
      h('td', { class: 'num sub', text: placed + ' / ' + mine.length }),
      h('td', { style: 'white-space:nowrap;width:1%' }, [
        h('button', { class: 'btn sm' + (isMe ? ' primary' : ''), text: isMe ? 'Open mine' : (submitted(f.id) ? 'View / edit' : 'This is me'),
          onclick: function () {
            if (!isMe && submitted(f.id) &&
                !confirm(f.name + ' has already submitted.\n\nOpen their availability? Only change it if you are ' + f.name + '.')) return;
            setMe(f.id); location.hash = '#/me'; render();
          } })
      ])
    ]);
  });

  body.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('h2', { text: 'Faculty', style: 'margin:0' }),
      h('span', { class: 'sub', text: facs.filter(function (f) { return submitted(f.id); }).length + ' of ' + facs.length + ' have submitted' }),
      h('span', { class: 'spacer' }), filter
    ]),
    h('div', { class: 'tablescroll', style: 'margin-top:10px' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, ['Name', 'Status', 'Availability', 'Exams placed', ''].map(function (t) { return h('th', { text: t }); }))]),
      h('tbody', { id: 'people-rows' }, rows)
    ])])
  ]));
}

/* ------------------------------------------------------ tab: availability */

function tabMe(wrap) {
  var st = settings();
  var a = S.data.avail[S.me] || {};
  var isSub = !!a.submitted;
  var mine = myExams();

  var days = S.res.days, cpd = S.res.cpd;
  var offered = 0, totalCells = days.length * cpd;
  days.forEach(function (d) {
    var s = curDay(d.key);
    for (var i = 0; i < s.length; i++) if (s[i] === '1') offered++;
  });
  var pctOpen = totalCells ? Math.round(offered / totalCells * 100) : 0;

  wrap.appendChild(h('div', { class: 'card' }, [
    h('h1', { text: facName(S.me) }),
    h('p', { class: 'sub', text: 'You sit on ' + mine.length + ' candidacy committee' + (mine.length === 1 ? '' : 's') +
      '. Below is ' + fmtDay(st.startDate) + ' through ' + fmtDay(st.endDate) +
      '. Every half hour starts open — click and drag to grey out the times you are NOT available.' }),
    !isSub ? h('div', { class: 'hint' }, [
      h('b', { text: 'Not submitted yet. ' }),
      document.createTextNode('Your committees cannot be scheduled until you press Submit at the bottom. You can keep editing after you submit.')
    ]) : h('div', { class: 'hint good' }, [
      h('b', { text: 'Submitted. ' }),
      document.createTextNode('Thanks — edits you make from here are picked up automatically.')
    ]),
    h('div', { class: 'row', style: 'margin-top:10px' }, [
      h('div', { style: 'flex:1;min-width:220px' }, [
        h('div', { class: 'sub', text: 'You have left ' + pctOpen + '% of the window open (' + Math.round(offered / 2) + ' hours).' }),
        h('div', { class: 'progress', style: 'margin-top:4px' }, [h('i', { style: 'width:' + pctOpen + '%;background:' + (pctOpen < 30 ? 'var(--bad)' : pctOpen < 45 ? 'var(--warn)' : '') })])
      ]),
      h('div', { class: 'sub', style: 'max-width:340px', text: pctOpen < 45
        ? 'Three schedules have to overlap, so tight availability is the main reason exams get stuck. Leaving roughly half the window open makes this easy.'
        : 'That is plenty of room for the solver to work with.' })
    ])
  ]));

  wrap.appendChild(myExamsCard(mine));

  // ---- the grid ----
  var help = {}, helpFor = {};
  // measure against the grid as it currently looks on screen, unsaved edits included
  var localGrid = {};
  days.forEach(function (d) { localGrid[d.key] = curDay(d.key); });
  var myFree = Solver.freeMaskFrom(S.res, localGrid);
  var windows = 0;
  for (var wi = 0; wi < myFree.length; wi++) windows += myFree[wi];
  if (S.showHelp) {
    mine.forEach(function (e) {
      var stx = examStatus(e);
      if (stx.kind !== 'stuck') return;
      if ((e.members || []).some(function (m) { return m !== S.me && !submitted(m); })) return;
      var cells = Solver.helperCells(S.res, { id: e.id, members: e.members, blackouts: e.blackouts || [] }, S.me, myFree);
      Object.keys(cells).forEach(function (c) { help[c] = 1; helpFor[c] = examName(e); });
    });
  }

  var gridCard = h('div', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('h2', { text: 'Your availability', style: 'margin:0' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: function () { bulk('1'); }, text: 'Open everything' }),
      h('button', { class: 'btn sm', onclick: function () { bulk('0'); }, text: 'Block everything' }),
      h('button', { class: 'btn sm', onclick: openTemplate, text: 'Repeat a weekly commitment…' })
    ]),
    h('div', { class: 'hint' + (windows ? ' good' : '') }, [
      h('b', { text: 'Exams need a ' + st.durationMin + '-minute block. ' }),
      document.createTextNode('Scattered half hours do not help — a gap only counts if it is ' +
        st.durationMin + ' minutes long with nothing in the middle, so leave whole mornings or ' +
        'afternoons open wherever you can.'),
      h('div', { style: 'margin-top:.4rem' }, [
        windows
          ? h('b', { text: 'Your calendar currently offers ' + windows + ' possible exam slot' + (windows === 1 ? '' : 's') + '.' })
          : h('b', { text: 'Your calendar currently offers no ' + st.durationMin + '-minute slots at all.' })
      ])
    ]),
    h('div', { class: 'legend' }, [
      h('span', {}, [h('i', { style: 'background:var(--free)' }), document.createTextNode('available')]),
      h('span', {}, [h('i', { style: 'background:var(--busy)' }), document.createTextNode('blocked')]),
      h('span', {}, [h('i', { style: 'background:var(--accent)' }), document.createTextNode('your scheduled exam')]),
      Object.keys(help).length ? h('span', {}, [h('i', { style: 'border:1.5px dashed var(--help);background:transparent' }), document.createTextNode('would unstick one of your exams')]) : null,
      h('label', { class: 'sub', style: 'margin-left:auto;display:flex;gap:6px;align-items:center' }, [
        h('input', { type: 'checkbox', checked: S.showHelp, onchange: function (e) { S.showHelp = e.target.checked; render(); } }),
        document.createTextNode('highlight helpful times')
      ])
    ])
  ]);
  gridCard.appendChild(buildGrid(days, cpd, st, help, true));
  wrap.appendChild(gridCard);

  wrap.appendChild(h('div', { class: 'card row' }, [
    h('button', { class: 'btn primary', onclick: submitAvail, text: isSub ? 'Save changes' : 'Submit my availability' }),
    h('span', { class: 'sub', id: 'save-state', text: Object.keys(S.pendingDays).length ? 'unsaved changes' : (a.updated ? 'last saved ' + new Date(a.updated).toLocaleString() : '') })
  ]));
}

function myExamsCard(mine) {
  if (!mine.length) return h('div', { class: 'card' }, [h('p', { class: 'sub', text: 'You are not listed on any committee. If that is wrong, contact the organiser.' })]);
  var rows = mine.map(function (e) {
    var others = (e.members || []).filter(function (m) { return m !== S.me; }).map(facName).join(', ');
    return h('li', {}, [
      h('div', { class: 'row' }, [h('b', { text: examName(e) }), h('span', { class: 'spacer' }), statusPill(e)]),
      h('div', { class: 'sub', text: 'with ' + others }),
      considerationText(e) ? h('div', { class: 'sub', style: 'font-style:italic', text: considerationText(e) }) : null
    ]);
  });
  var booked = mine.filter(function (e) { return S.res.confirmed[e.id]; }).length;
  return h('div', { class: 'card' }, [
    h('h2', { text: 'Your exams' }),
    h('p', { class: 'sub', text: booked + ' of ' + mine.length + ' booked. A time is only fixed once it shows a date — everything else is still moving.' }),
    h('ul', { class: 'clean' }, rows)
  ]);
}

/* -------------------------------------------------- availability grid draw */

function curDay(key) {
  if (S.pendingDays[key] != null) return S.pendingDays[key];
  var a = S.data.avail[S.me];
  var v = a && a.days && a.days[key];
  if (v) return v;
  return defaultDay();
}
function defaultDay() {
  var cpd = Solver.cellsPerDay(settings());
  var mode = (S.data.meta && S.data.meta.mode) || 'blockout';
  return (mode === 'blockout' ? '1' : '0').repeat(cpd);
}

function buildGrid(days, cpd, st, help, editable) {
  var host = h('div', {});
  // group into calendar weeks
  var weeks = [], cur = null;
  days.forEach(function (d) {
    var dd = Solver.parseYmd(d.key);
    var monday = new Date(dd); monday.setDate(dd.getDate() - ((dd.getDay() + 6) % 7));
    var wk = Solver.ymd(monday);
    if (!cur || cur.key !== wk) { cur = { key: wk, days: [] }; weeks.push(cur); }
    cur.days.push(d);
  });

  var myAssigned = {};
  if (S.role === 'faculty') {
    myExams().forEach(function (e) {
      var s = S.res.confirmed[e.id]; if (!s) return;
      var slot = S.res.slots[s.slotId];
      slot.cells.forEach(function (c, i) { myAssigned[c] = i === 0 ? examName(e) : ''; });
    });
  }

  weeks.forEach(function (wk) {
    var m = Solver.parseYmd(wk.key);
    var block = h('div', { class: 'weekblock' }, [
      h('h3', { text: 'Week of ' + MONS[m.getMonth()] + ' ' + m.getDate() })
    ]);
    var tbl = h('table', { class: 'avail' });
    var thead = h('thead'), hr = h('tr', {}, [h('th', { class: 'timecol' })]);
    wk.days.forEach(function (d) {
      var dd = Solver.parseYmd(d.key);
      hr.appendChild(h('th', {}, [
        editable
          ? h('button', { class: 'btn sm ghost', title: 'toggle the whole day', style: 'padding:1px 5px',
              onclick: function () { toggleDay(d.key); },
              text: DOWS[dd.getDay()] + ' ' + (dd.getMonth() + 1) + '/' + dd.getDate() })
          : document.createTextNode(DOWS[dd.getDay()] + ' ' + (dd.getMonth() + 1) + '/' + dd.getDate())
      ]));
    });
    thead.appendChild(hr); tbl.appendChild(thead);

    var tb = h('tbody');
    for (var c = 0; c < cpd; c++) {
      var min = st.dayStartMin + c * Solver.CELL;
      var tr = h('tr');
      tr.appendChild(h('td', { class: 'timecol', text: (min % 60 === 0) ? fmtTime(min) : '' }));
      wk.days.forEach(function (d) {
        var di = days.indexOf(d), g = di * cpd + c;
        var on = curDay(d.key)[c] === '1';
        var cls = 'cell' + (on ? ' on' : '') + (min % 60 === 0 ? ' hour' : '');
        if (myAssigned[g] !== undefined) cls += ' exam';
        else if (help && help[g]) cls += ' help';
        var td = h('td', { class: cls, dataset: { day: d.key, c: String(c) } });
        if (myAssigned[g]) td.dataset.lbl = myAssigned[g];
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    block.appendChild(h('div', { class: 'calscroll' }, [tbl]));
    host.appendChild(block);
  });

  if (editable) attachPaint(host);
  return host;
}

function attachPaint(host) {
  var painting = false, mode = '1';
  function setPainting(v) { painting = v; S.painting = v; }
  function apply(td) {
    if (!td || !td.dataset || !td.dataset.day) return;
    var key = td.dataset.day, c = +td.dataset.c;
    var s = curDay(key).split('');
    if (s[c] === mode) return;
    s[c] = mode;
    S.pendingDays[key] = s.join('');
    td.classList.toggle('on', mode === '1');
    queueSave();
  }
  host.addEventListener('mousedown', function (e) {
    var td = e.target.closest('td.cell'); if (!td) return;
    e.preventDefault();
    setPainting(true);
    mode = td.classList.contains('on') ? '0' : '1';
    apply(td);
  });
  host.addEventListener('mouseover', function (e) {
    if (!painting) return;
    var td = e.target.closest('td.cell'); if (td) apply(td);
  });
  host.addEventListener('touchstart', function (e) {
    var td = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    td = td && td.closest && td.closest('td.cell'); if (!td) return;
    e.preventDefault(); setPainting(true);
    mode = td.classList.contains('on') ? '0' : '1';
    apply(td);
  }, { passive: false });
  host.addEventListener('touchmove', function (e) {
    if (!painting) return;
    e.preventDefault();
    var t = e.touches[0], el = document.elementFromPoint(t.clientX, t.clientY);
    el = el && el.closest && el.closest('td.cell'); if (el) apply(el);
  }, { passive: false });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(function (ev) {
    window.addEventListener(ev, function () { if (painting) { setPainting(false); rerender(); } });
  });
}

function toggleDay(key) {
  var s = curDay(key);
  var anyOn = s.indexOf('1') >= 0;
  S.pendingDays[key] = (anyOn ? '0' : '1').repeat(s.length);
  queueSave(); render();
}
function bulk(v) {
  var days = S.res.days, cpd = S.res.cpd;
  days.forEach(function (d) { S.pendingDays[d.key] = v.repeat(cpd); });
  queueSave(); render();
}

var queueSave = debounce(function () {
  var keys = Object.keys(S.pendingDays);
  if (!keys.length || !S.db) return;
  var patch = {};
  keys.forEach(function (k) { patch[k] = S.pendingDays[k]; });
  var snapshot = keys.slice();
  S.db.patch(S.root + '/avail/' + S.me + '/days', patch).then(function () {
    S.db.patch(S.root + '/avail/' + S.me, { updated: Date.now() });
    snapshot.forEach(function (k) { if (S.pendingDays[k] === patch[k]) delete S.pendingDays[k]; });
    var el = $('#save-state'); if (el) el.textContent = 'saved ' + new Date().toLocaleTimeString();
  }).catch(function (e) {
    var el = $('#save-state'); if (el) el.textContent = 'could not save — retrying';
    setTimeout(queueSave, 3000);
  });
}, 900);

function submitAvail() {
  if (!S.db) return;
  var keys = Object.keys(S.pendingDays), patch = {};
  keys.forEach(function (k) { patch[k] = S.pendingDays[k]; });
  // make sure every day in the window has an explicit value
  S.res.days.forEach(function (d) { if (patch[d.key] === undefined && !(S.data.avail[S.me] && S.data.avail[S.me].days && S.data.avail[S.me].days[d.key])) patch[d.key] = curDay(d.key); });
  S.db.patch(S.root + '/avail/' + S.me + '/days', patch)
    .then(function () { return S.db.patch(S.root + '/avail/' + S.me, { submitted: true, updated: Date.now() }); })
    .then(function () { S.pendingDays = {}; toast('Availability submitted — thank you.'); })
    .catch(function (e) { toast('Save failed: ' + e.message, 5000); });
}

function openTemplate() {
  var st = settings(), cpd = S.res.cpd;
  var body = h('div', {}, [
    h('p', { class: 'sub', text: 'Block the same window every week — a course, a group meeting, a standing seminar.' }),
    h('label', { class: 'field' }, [h('span', { text: 'Day of week' }),
      h('select', { id: 't-dow' }, [1, 2, 3, 4, 5].map(function (d) { return h('option', { value: String(d), text: DOWFULL[d] + 's' }); }))]),
    h('div', { class: 'row' }, [
      h('label', { class: 'field' }, [h('span', { text: 'From' }), timeSelect('t-from', st, st.dayStartMin)]),
      h('label', { class: 'field' }, [h('span', { text: 'To' }), timeSelect('t-to', st, st.dayStartMin + 120)])
    ])
  ]);
  modal('Repeat a weekly commitment', body, [
    { text: 'Block it', primary: true, fn: function () {
      var dow = +$('#t-dow').value, a = +$('#t-from').value, b = +$('#t-to').value;
      if (b <= a) { toast('End must be after start'); return true; }
      S.res.days.forEach(function (d) {
        if (Solver.parseYmd(d.key).getDay() !== dow) return;
        var s = curDay(d.key).split('');
        for (var m = a; m < b; m += Solver.CELL) {
          var c = Math.round((m - st.dayStartMin) / Solver.CELL);
          if (c >= 0 && c < cpd) s[c] = '0';
        }
        S.pendingDays[d.key] = s.join('');
      });
      queueSave(); render();
    } }
  ]);
}

function timeSelect(id, st, val) {
  var opts = [];
  for (var m = st.dayStartMin; m <= st.dayEndMin; m += Solver.CELL) opts.push(h('option', { value: String(m), text: fmtTime(m), selected: m === val }));
  return h('select', { id: id }, opts);
}

/* ================================================================== modals */

function modal(title, body, buttons) {
  $('#modal-title').textContent = title;
  var b = $('#modal-body'); b.textContent = ''; b.appendChild(body);
  var f = $('#modal-foot'); f.textContent = '';
  (buttons || []).forEach(function (btn) {
    f.appendChild(h('button', { class: 'btn' + (btn.primary ? ' primary' : '') + (btn.danger ? ' danger' : ''), text: btn.text,
      onclick: function () { if (btn.fn && btn.fn() === true) return; closeModal(); } }));
  });
  f.appendChild(h('button', { class: 'btn ghost', text: 'Close', onclick: closeModal }));
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').addEventListener('click', closeModal);
$('#modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });

/* ================================================================ boot ==== */

function renderError(e) {
  $('#app').textContent = '';
  $('#app').appendChild(h('div', { class: 'wrap' }, [h('div', { class: 'card' }, [
    h('h1', { text: 'Could not reach the database' }),
    h('p', { class: 'sub', text: String(e && e.message || e) }),
    h('p', { class: 'sub', text: 'Check the database URL and that its rules allow read and write on /candidacy.' }),
    h('button', { class: 'btn', text: 'Change database URL', onclick: function () { localStorage.removeItem('cs.db'); location.reload(); } })
  ])]));
}

document.addEventListener('DOMContentLoaded', function () {
  route();
  connect();
});

/* exported for the admin module */
window.CS = { S: S, h: h, $: $, $$: $$, toast: toast, esc: esc, modal: modal, closeModal: closeModal,
  fmtTime: fmtTime, fmtDay: fmtDay, fmtDayLong: fmtDayLong, DOWS: DOWS, DOWFULL: DOWFULL, MONS: MONS, slug: slug, token: token,
  sha: sha, copyText: copyText, settings: settings, facList: facList, examList: examList, facName: facName,
  examName: examName, submitted: submitted, buildGrid: buildGrid, timeSelect: timeSelect, render: render,
  resolveAndRender: resolveAndRender, debounce: debounce, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  setDbUrl: setDbUrl, dbUrl: dbUrl, setMe: setMe, shareLink: shareLink, defaultDay: defaultDay, progressCard: progressCard, pendingCount: pendingCount, considerationText: considerationText,
  examStatus: examStatus, statusPill: statusPill, orderedOptions: orderedOptions,
  bookingWarningText: bookingWarningText, warningFor: warningFor };
})();
