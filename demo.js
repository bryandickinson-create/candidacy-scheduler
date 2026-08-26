/* demo.js — with ?demo on the URL, swap Firebase for an in-browser store.
   Changes broadcast between tabs, so the live behaviour is real; only the
   server is fake. Nothing leaves this browser. Add &fresh to reseed. */
(function () {
'use strict';
if (!/[?&]demo\b/.test(location.search)) return;

var KEY = 'cs.demo.store';
var chan = ('BroadcastChannel' in window) ? new BroadcastChannel('cs-demo') : null;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save(o) { localStorage.setItem(KEY, JSON.stringify(o)); if (chan) chan.postMessage(Date.now()); }

function at(obj, path, make) {
  var parts = String(path || '').split('/').filter(Boolean), cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null || typeof cur[parts[i]] !== 'object') {
      if (!make) return undefined;
      cur[parts[i]] = {};
    }
    cur = cur[parts[i]];
  }
  return cur;
}
function setAt(obj, path, val) {
  var parts = String(path || '').split('/').filter(Boolean);
  if (!parts.length) return val === null ? {} : val;
  var cur = obj;
  for (var i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  if (val === null) delete cur[parts[parts.length - 1]]; else cur[parts[parts.length - 1]] = val;
  return obj;
}
function getAt(obj, path) {
  var parts = String(path || '').split('/').filter(Boolean), cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return null;
    cur = cur[parts[i]];
  }
  return cur === undefined ? null : cur;
}

function MockFB(url) { this.base = url || 'demo://local'; }
MockFB.prototype.ok = function () { return true; };
MockFB.prototype.get = function (p) { return Promise.resolve(getAt(load(), p)); };
MockFB.prototype.put = function (p, v) { var s = load(); s = setAt(s, p, v); save(s); return Promise.resolve(v); };
MockFB.prototype.del = function (p) { return this.put(p, null); };
MockFB.prototype.patch = function (p, o) {
  var s = load();
  Object.keys(o || {}).forEach(function (k) { s = setAt(s, p + '/' + k, o[k]); });
  save(s); return Promise.resolve(o);
};
MockFB.prototype.stream = function (p, onEvent, onState) {
  setTimeout(function () { onState && onState('open'); }, 60);
  function push() { onEvent({ type: 'put', path: '/', data: getAt(load(), p) || {} }); }
  var onMsg = function () { push(); };
  if (chan) chan.addEventListener('message', onMsg);
  var poll = setInterval(push, 4000);   // covers browsers without BroadcastChannel
  return { close: function () { clearInterval(poll); if (chan) chan.removeEventListener('message', onMsg); } };
};
MockFB.prototype.closeAll = function () {};
MockFB.applyEvent = window.FB.applyEvent;

window.FB = MockFB;
window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.databaseURL = 'demo://local';
window.APP_CONFIG.eventId = 'demo';

/* ---- seed a believable event so there is something to look at ---- */
function m32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function seed() {
  var st = { startDate: '2026-10-01', endDate: '2026-11-30', dayStartMin: 540, dayEndMin: 1020,
             slotStepMin: 60, durationMin: 90, weekdaysOnly: true, excludeDates: ['2026-11-26', '2026-11-27'] };
  var R = window.ROSTER_SEED;
  var days = Solver.buildDays(st), cpd = Solver.cellsPerDay(st);
  var rnd = m32(20261001);

  function sl(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function tok() { var o = ''; for (var i = 0; i < 9; i++) o += 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 30)]; return o; }

  var faculty = {}, byName = {};
  R.faculty.forEach(function (n) { var id = sl(n); faculty[id] = { name: n, email: sl(n).split('-').pop() + '@example.edu', token: tok() }; byName[n] = id; });

  var exams = {}, seen = {};
  R.exams.forEach(function (e) {
    var id = sl(e.last + '-' + e.first), n = 1;
    while (seen[id]) id = sl(e.last + '-' + e.first) + '-' + (++n);
    seen[id] = 1;
    exams[id] = { last: e.last, first: e.first, members: e.members.map(function (m) { return byName[m]; }), blackouts: [] };
  });
  // one student constraint, to show the feature
  var firstId = Object.keys(exams)[0];
  exams[firstId].blackouts = [{ from: '2026-10-01', to: '2026-10-17', label: 'away at a conference' }];

  // 30 of 45 have replied; each blocks teaching plus meetings
  var avail = {};
  R.faculty.forEach(function (n, i) {
    if (i % 3 === 2) return;                       // roughly a third have not replied
    var id = byName[n], grid = {};
    days.forEach(function (d) { grid[d.key] = '1'.repeat(cpd).split(''); });
    var nCourse = 2 + Math.floor(rnd() * 2);
    for (var ci = 0; ci < nCourse; ci++) {
      var dow = 1 + Math.floor(rnd() * 5), c0 = Math.floor(rnd() * (cpd - 3)), len = 2 + Math.floor(rnd() * 2);
      days.forEach(function (d) { if (d.dow !== dow) return; for (var k = 0; k < len; k++) grid[d.key][c0 + k] = '0'; });
    }
    var extra = Math.floor(days.length * 0.9);
    for (var q = 0; q < extra; q++) {
      var d2 = days[Math.floor(rnd() * days.length)], cc = Math.floor(rnd() * (cpd - 2));
      grid[d2.key][cc] = '0'; grid[d2.key][cc + 1] = '0';
    }
    var rec = {};
    days.forEach(function (d) { rec[d.key] = grid[d.key].join(''); });
    avail[id] = { submitted: true, updated: Date.now() - Math.floor(rnd() * 6e8), days: rec };
  });

  var store = {};
  setAt(store, 'candidacy/demo', {
    meta: { title: 'Candidacy Exams — Autumn 2026 (demo data)', created: Date.now(), adminHash: null, mode: 'blockout' },
    settings: st, faculty: faculty, exams: exams, avail: avail
  });
  save(store);
}

if (/[?&]empty\b/.test(location.search)) save({});          // exercise the create-event flow
else if (/[?&]fresh\b/.test(location.search) || !getAt(load(), 'candidacy/demo/meta')) seed();
})();
