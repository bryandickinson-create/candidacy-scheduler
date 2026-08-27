/* admin.js — setup, landing pages, and the organiser's console. */
(function () {
'use strict';
var A = window.Admin = window.Admin || {};

function C() { return window.CS; }
function S() { return window.CS.S; }
function db() { return window.CS.S.db; }
function root() { return window.CS.S.root; }

/* ------------------------------------------------------------------ setup */

A.renderSetup = function () {
  var c = C(), h = c.h;
  var app = c.$('#app'); app.textContent = '';
  app.appendChild(h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('h1', { text: 'One-time setup' }),
      h('p', { class: 'sub', text: 'This app keeps everything in a Firebase Realtime Database, which is free at this size and needs no server of your own.' }),
      h('ol', { class: 'sub', style: 'line-height:1.8' }, [
        h('li', { html: 'Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a> and create a project (no billing needed).' }),
        h('li', { html: 'In the left sidebar choose <b>Build → Realtime Database → Create Database</b>. Pick any location and start in <b>test mode</b>.' }),
        h('li', { html: 'Open the <b>Rules</b> tab and paste the rules shown below, then Publish.' }),
        h('li', { html: 'Copy the database URL from the top of the Data tab and paste it here.' })
      ]),
      h('label', { class: 'field' }, [h('span', { text: 'Database URL' }),
        h('input', { type: 'text', id: 'su-url', style: 'width:100%', placeholder: 'https://your-project-default-rtdb.firebaseio.com' })]),
      h('div', { class: 'row' }, [
        h('button', { class: 'btn primary', text: 'Connect', onclick: function () {
          var u = c.$('#su-url').value.trim().replace(/\/+$/, '');
          if (!/^https:\/\//.test(u)) { c.toast('That does not look like a URL'); return; }
          var probe = new FB(u);
          probe.get('candidacy').then(function () {
            c.setDbUrl(u); location.reload();
          }).catch(function (e) { c.toast('Could not read from that database: ' + e.message, 6000); });
        } })
      ]),
      h('h3', { style: 'margin-top:1.4rem', text: 'Rules to paste' }),
      h('p', { class: 'sub', text: 'These let anyone with a link read and write this one branch, and nothing else. That is the same trade-off as a shared Google Sheet link — fine for scheduling, not for anything confidential.' }),
      h('textarea', { readonly: true, style: 'min-height:150px', text:
        '{\n  "rules": {\n    ".read": false,\n    ".write": false,\n    "candidacy": {\n      ".read": true,\n      ".write": true,\n      ".indexOn": []\n    }\n  }\n}' })
    ])
  ]));
};

/* --------------------------------------------------------------- landing */

A.landing = function () {
  var c = C(), h = c.h, S_ = S();
  var hasEvent = !!(S_.data.meta);
  return h('div', { class: 'wrap' }, [
    h('div', { class: 'card' }, [
      h('h1', { text: hasEvent ? (S_.data.meta.title || 'Candidacy Exam Scheduling') : 'Candidacy Exam Scheduling' }),
      hasEvent
        ? h('p', { class: 'sub', text: 'Faculty: open the personal link you were emailed. It looks like this page’s address with #/f/… on the end.' })
        : h('p', { class: 'sub', text: 'No event has been created yet.' }),
      h('div', { class: 'row', style: 'margin-top:12px' }, [
        h('button', { class: 'btn primary', text: hasEvent ? 'Organiser sign-in' : 'Create the event', onclick: function () { location.hash = '#/admin'; } })
      ])
    ])
  ]);
};

A.badLink = function () {
  var c = C(), h = c.h;
  return h('div', { class: 'wrap' }, [h('div', { class: 'card' }, [
    h('h1', { text: 'That link is not recognised' }),
    h('p', { class: 'sub', text: 'The personal link may have been truncated by your mail client, or the organiser may have regenerated it. Ask them to resend it.' }),
    h('button', { class: 'btn', text: 'Back', onclick: function () { location.hash = '#/'; } })
  ])]);
};

/* ------------------------------------------------------------ admin gate */

A.ok = function () {
  var S_ = S();
  if (!S_.data.meta || !S_.data.meta.adminHash) return true;         // not configured yet
  return C().sha(localStorage.getItem('cs.pin') || '') === S_.data.meta.adminHash;
};

A.gate = function () {
  var c = C(), h = c.h;
  return h('div', { class: 'wrap' }, [h('div', { class: 'card' }, [
    h('h1', { text: 'Organiser sign-in' }),
    h('label', { class: 'field' }, [h('span', { text: 'Passphrase' }),
      h('input', { type: 'password', id: 'pin', style: 'width:260px', onkeydown: function (e) { if (e.key === 'Enter') go(); } })]),
    h('button', { class: 'btn primary', text: 'Enter', onclick: go })
  ])]);
  function go() {
    var v = c.$('#pin').value;
    if (c.sha(v) !== S().data.meta.adminHash) { c.toast('Not that one'); return; }
    localStorage.setItem('cs.pin', v); c.render();
  }
};

/* =================================================================== view */

var TABS = [['dash', 'Dashboard'], ['sched', 'Schedule'], ['exams', 'Exams'], ['fac', 'Faculty'], ['set', 'Settings']];

A.view = function (wrap) {
  var c = C(), h = c.h, S_ = S();
  if (!S_.data.meta) { wrap.appendChild(createEvent()); return; }

  var tabs = h('div', { class: 'tabs' }, TABS.map(function (t) {
    return h('button', { 'aria-selected': S_.tab === t[0] ? 'true' : 'false', text: t[1],
      onclick: function () { S_.tab = t[0]; location.hash = '#/admin/' + t[0]; } });
  }));
  wrap.appendChild(tabs);
  var body = h('div');
  wrap.appendChild(body);
  ({ dash: tabDash, sched: tabSched, exams: tabExams, fac: tabFaculty, set: tabSettings }[S_.tab] || tabDash)(body);
};

/* ---------------------------------------------------------- create event */

function createEvent() {
  var c = C(), h = c.h;
  return h('div', { class: 'card' }, [
    h('h1', { text: 'Create the event' }),
    h('p', { class: 'sub', text: 'This writes the roster and the scheduling window. You can change all of it afterwards.' }),
    h('label', { class: 'field' }, [h('span', { text: 'Title' }), h('input', { type: 'text', id: 'ce-title', value: 'Candidacy Exams — Autumn 2026', style: 'width:100%;max-width:420px' })]),
    h('label', { class: 'field' }, [h('span', { text: 'Organiser passphrase (you will need this to get back in)' }), h('input', { type: 'password', id: 'ce-pin', style: 'width:260px' })]),
    h('div', { class: 'row' }, [
      h('label', { class: 'field' }, [h('span', { text: 'From' }), h('input', { type: 'date', id: 'ce-a', value: c.DEFAULT_SETTINGS.startDate })]),
      h('label', { class: 'field' }, [h('span', { text: 'To' }), h('input', { type: 'date', id: 'ce-b', value: c.DEFAULT_SETTINGS.endDate })])
    ]),
    h('label', { class: 'field' }, [h('span', { text: 'Roster — one exam per line: Last, First, Member 1, Member 2, Member 3' }),
      h('textarea', { id: 'ce-roster', style: 'min-height:180px', text: seedText() })]),
    h('button', { class: 'btn primary', text: 'Create', onclick: function () {
      var pin = c.$('#ce-pin').value;
      if (pin.length < 4) { c.toast('Use at least 4 characters'); return; }
      var parsed = parseRoster(c.$('#ce-roster').value);
      if (parsed.errors.length) { c.toast(parsed.errors[0], 6000); return; }
      var payload = {
        meta: { title: c.$('#ce-title').value.trim() || 'Candidacy Exams', created: Date.now(), adminHash: c.sha(pin), mode: 'blockout' },
        settings: Object.assign({}, c.DEFAULT_SETTINGS, { startDate: c.$('#ce-a').value, endDate: c.$('#ce-b').value }),
        faculty: parsed.faculty, exams: parsed.exams
      };
      db().patch(root(), payload).then(function () {
        localStorage.setItem('cs.pin', pin);
        c.toast('Event created'); 
      }).catch(function (e) { c.toast('Failed: ' + e.message, 6000); });
    } })
  ]);
}

function seedText() {
  var seed = window.ROSTER_SEED;
  if (!seed) return '';
  return seed.exams.map(function (e) { return [e.last, e.first].concat(e.members).join(', '); }).join('\n');
}

function parseRoster(text) {
  var c = C();
  var faculty = {}, exams = {}, errors = [], byName = {};
  // keep existing faculty ids/tokens so links survive a re-import
  var existing = S().data.faculty || {};
  Object.keys(existing).forEach(function (id) { byName[norm(existing[id].name)] = id; faculty[id] = existing[id]; });

  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function fid(name) {
    var k = norm(name);
    if (byName[k]) return byName[k];
    var id = c.slug(name), n = 1;
    while (faculty[id]) id = c.slug(name) + '-' + (++n);
    faculty[id] = { name: String(name).replace(/\s+/g, ' ').trim(), email: '', token: c.token() };
    byName[k] = id;
    return id;
  }

  var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  var seenIds = {};
  lines.forEach(function (line, i) {
    if (/^last\s*name/i.test(line)) return;
    var parts = line.split(/\t|,(?![^(]*\))/).map(function (p) { return p.trim(); });
    if (parts.length < 5) { errors.push('Line ' + (i + 1) + ' needs 5 fields: ' + line); return; }
    var last = parts[0], first = parts[1], members = parts.slice(2, 5);
    if (members.some(function (m) { return !m; })) { errors.push('Line ' + (i + 1) + ' has a blank committee member'); return; }
    var ids = members.map(fid);
    if (new Set(ids).size !== 3) { errors.push('Line ' + (i + 1) + ' lists the same person twice'); return; }
    var id = c.slug(last + '-' + first), n = 1;
    while (seenIds[id]) id = c.slug(last + '-' + first) + '-' + (++n);
    seenIds[id] = 1;
    // Carry every organiser-entered field across a re-import. Anything added to
    // an exam later must be listed here or a re-import silently discards it.
    var old = (S().data.exams || {})[id] || {};
    exams[id] = {
      last: last, first: first, members: ids,
      blackouts: old.blackouts || [],
      note: old.note || '',
      prefer: old.prefer || null
    };
  });
  return { faculty: faculty, exams: exams, errors: errors };
}

/* ================================================================= tab: dashboard */

function facLink() { return C().shareLink(); }   // one link, same for everyone

function tabDash(body) {
  var c = C(), h = c.h, S_ = S(), res = S_.res;

  if (!(S_.data.meta && S_.data.meta.adminHash)) {
    body.appendChild(h('div', { class: 'hint' }, [
      h('b', { text: 'No organiser passphrase set. ' }),
      document.createTextNode('Anyone who opens this page can book, release and edit. A passphrase will not stop someone determined — the data is reachable either way — but it keeps colleagues from wandering in here by accident.'),
      h('div', { class: 'row', style: 'margin-top:.6rem' }, [
        h('input', { type: 'password', id: 'quick-pin', placeholder: 'choose a passphrase', style: 'width:230px',
          onkeydown: function (ev) { if (ev.key === 'Enter') setPin(); } }),
        h('button', { class: 'btn sm primary', text: 'Set it', onclick: setPin })
      ])
    ]));
  }
  function setPin() {
    var v = c.$('#quick-pin').value;
    if (v.length < 4) { c.toast('Use at least 4 characters'); return; }
    db().patch(root() + '/meta', { adminHash: c.sha(v) })
      .then(function () { localStorage.setItem('cs.pin', v); c.toast('Passphrase set'); });
  }

  body.appendChild(c.progressCard());

  /* --- what is blocking things --- */
  var exams = c.examList();
  var waiting = [], impossible = [], contention = [];
  exams.forEach(function (e) {
    var st = c.examStatus(e);
    if (st.kind === 'confirmed' || st.kind === 'ready') return;
    if (st.kind === 'waiting') waiting.push({ e: e, who: st.missing });
    else if (st.squeezed) contention.push(e);
    else impossible.push(e);
  });

  var nudge = {};
  waiting.forEach(function (w) { w.who.forEach(function (m) { nudge[m] = (nudge[m] || 0) + 1; }); });
  impossible.forEach(function (e) {
    var b = res.diag[e.id].blame;
    var top = Object.keys(b).sort(function (x, y) { return b[y] - b[x]; })[0];
    if (top && b[top] > 0) nudge[top] = (nudge[top] || 0) + 1;
  });
  var rank = Object.keys(nudge).sort(function (a, b) { return nudge[b] - nudge[a]; });

  if (rank.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Who to chase, in order' }),
      h('p', { class: 'sub', text: 'Each person is listed with the number of exams currently held up by them alone. Chasing the top of this list clears the most exams per email.' }),
      h('ul', { class: 'clean' }, rank.slice(0, 12).map(function (fid) {
        var f = S_.data.faculty[fid] || { name: fid };
        var sub = c.submitted(fid);
        return h('li', { class: 'row' }, [
          h('b', { text: String(nudge[fid]), style: 'min-width:1.6rem;text-align:right' }),
          h('span', { text: f.name }),
          sub ? h('span', { class: 'pill warn', text: 'submitted, but too little open' })
              : h('span', { class: 'pill bad', text: 'no response yet' }),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm ghost', text: 'Open their grid', onclick: function () { c.setMe(fid); location.hash = '#/me'; } }),
          f.email ? h('a', { class: 'btn sm', href: mailtoFor(fid), text: 'Email' }) : null
        ]);
      }))
    ]));
  }

  if (impossible.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Exams with no workable time (' + impossible.length + ')' }),
      h('p', { class: 'sub', text: 'All three members have submitted, but there is no 90-minute window where all three are free.' }),
      h('ul', { class: 'clean' }, impossible.map(function (e) {
        var b = res.diag[e.id].blame;
        var order = Object.keys(b).sort(function (x, y) { return b[y] - b[x]; });
        return h('li', {}, [
          h('div', { class: 'row' }, [h('b', { text: c.examName(e) }), h('span', { class: 'spacer' }),
            h('span', { class: 'pill bad', text: 'no common window' })]),
          h('div', { class: 'sub', text: order.map(function (m) {
            return c.facName(m) + (b[m] ? ' — alone blocks ' + b[m] + ' otherwise-workable slot' + (b[m] === 1 ? '' : 's') : '');
          }).join(' · ') })
        ]);
      }))
    ]));
  }

  if (contention.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Squeezed out by other exams (' + contention.length + ')' }),
      h('p', { class: 'sub', text: 'A common window exists, but every one of them is taken by another exam sharing a member. Unpinning an exam, or asking one member for a little more room, usually clears these.' }),
      h('ul', { class: 'clean' }, contention.map(function (e) {
        return h('li', { class: 'row' }, [h('b', { text: c.examName(e) }),
          h('span', { class: 'sub', text: (res.diag[e.id].common) + ' common window' + (res.diag[e.id].common === 1 ? '' : 's') + ', all occupied' }),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm', text: 'Book…', onclick: function () { bookDialog(e); } })]);
      }))
    ]));
  }

  /* --- response tracker --- */
  var facs = c.facList();
  body.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('h2', { text: 'Faculty', style: 'margin:0' }), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', text: 'Copy the shared link', onclick: function () {
        c.copyText(c.shareLink()).then(function () { c.toast('Copied — this is the only link anyone needs'); });
      } }),
      h('button', { class: 'btn sm', text: 'Email everyone', onclick: function () { bulkMail(facs, 'Invite all ' + facs.length + ' faculty'); } }),
      h('button', { class: 'btn sm ghost', text: 'Email non-responders', onclick: function () {
        var out = facs.filter(function (f) { return !c.submitted(f.id); });
        bulkMail(out, 'Chase the ' + out.length + ' who have not replied');
      } })
    ]),
    facTable(facs)
  ]));

  body.appendChild(exportCard());
}

function facTable(facs) {
  var c = C(), h = c.h, S_ = S(), res = S_.res;
  var cpd = res.cpd, total = res.days.length * cpd;
  var rows = facs.map(function (f) {
    var a = S_.data.avail[f.id];
    var open = 0;
    if (a && a.days) res.days.forEach(function (d) { var s = a.days[d.key] || ''; for (var i = 0; i < s.length; i++) if (s[i] === '1') open++; });
    var pct = total ? Math.round(open / total * 100) : 0;
    var mine = c.examList().filter(function (e) { return (e.members || []).indexOf(f.id) >= 0; });
    var placed = mine.filter(function (e) { return res.confirmed[e.id]; }).length;
    return h('tr', {}, [
      h('td', {}, [h('b', { text: f.name })]),
      h('td', {}, [c.submitted(f.id) ? h('span', { class: 'pill ok', text: 'submitted' }) : h('span', { class: 'pill bad', text: 'no reply' })]),
      h('td', { class: 'num', text: c.submitted(f.id) ? pct + '%' : '—' }),
      h('td', { class: 'num', text: placed + ' / ' + mine.length }),
      h('td', { class: 'sub', text: a && a.updated ? new Date(a.updated).toLocaleDateString() : '' }),
      h('td', { style: 'white-space:nowrap' }, [
        h('button', { class: 'btn sm ghost', text: 'Open grid', onclick: function () { c.setMe(f.id); location.hash = '#/me'; } })
      ])
    ]);
  });
  return h('div', { class: 'tablescroll' }, [h('table', { class: 'data' }, [
    h('thead', {}, [h('tr', {}, ['Name', 'Status', 'Open', 'Exams placed', 'Updated', ''].map(function (t) { return h('th', { text: t }); }))]),
    h('tbody', {}, rows)
  ])]);
}

function inviteBody(greeting) {
  return greeting + '\n\n' +
    'We are scheduling this autumn\'s candidacy exams. Everything runs off one page:\n\n' +
    C().shareLink() + '\n\n' +
    'Find your name in the list, click it, and grey out the times you are NOT available. ' +
    'The calendar starts completely open, so you only need to block what does not work — ' +
    'teaching, standing meetings, travel. There is a button for repeating a weekly commitment across the whole quarter.\n\n' +
    'Please leave as much open as you honestly can. Each exam needs 90 minutes where all three committee members are free, ' +
    'so a nearly-full calendar from one person can stall several students.\n\n' +
    'The page updates live: you will see exams land on the calendar as your colleagues reply, and you can go back and adjust at any time.\n\nThank you.';
}

function mailtoFor(fid) {
  var f = S().data.faculty[fid];
  var title = (S().data.meta && S().data.meta.title) || 'Candidacy exams';
  return 'mailto:' + encodeURIComponent(f.email || '') +
    '?subject=' + encodeURIComponent(title + ' — your availability') +
    '&body=' + encodeURIComponent(inviteBody('Hi ' + f.name + ','));
}

function bulkMail(list, title) {
  var c = C(), h = c.h;
  if (!list.length) { c.toast('Everyone has replied'); return; }
  var withEmail = list.filter(function (f) { return f.email; });
  var missing = list.filter(function (f) { return !f.email; });
  var title = (S().data.meta && S().data.meta.title) || 'Candidacy exams';
  var addrs = withEmail.map(function (f) { return f.email; }).join(',');
  var text = inviteBody('Dear colleagues,');
  var href = 'mailto:?bcc=' + encodeURIComponent(addrs) +
    '&subject=' + encodeURIComponent(title + ' — your availability') + '&body=' + encodeURIComponent(text);

  var body = h('div', {}, [
    h('p', { class: 'sub', text: list.length + ' recipients.' +
      (missing.length ? ' ' + missing.length + ' have no email address on file (' + missing.slice(0, 6).map(function (f) { return f.name; }).join(', ') + (missing.length > 6 ? '…' : '') + ') — add them on this tab.' : '') }),
    h('p', { class: 'sub', text: 'Everyone shares one link, so this is a single email. Addresses go in BCC.' }),
    h('label', { class: 'field' }, [h('span', { text: 'BCC' }),
      h('textarea', { id: 'bm-to', readonly: true, style: 'min-height:70px', text: addrs })]),
    h('label', { class: 'field' }, [h('span', { text: 'Message' }),
      h('textarea', { id: 'bm-body', readonly: true, style: 'min-height:230px', text: text })])
  ]);
  c.modal(title || ('Email ' + list.length + ' people'), body, [
    { text: 'Open in mail app', primary: true, fn: function () { window.location.href = href; } },
    { text: 'Copy addresses', fn: function () { c.copyText(addrs).then(function () { c.toast('Copied ' + withEmail.length + ' addresses'); }); return true; } },
    { text: 'Copy message', fn: function () { c.copyText(text).then(function () { c.toast('Copied'); }); return true; } }
  ]);
}

/* ================================================================= tab: schedule */

function tabSched(body) {
  var c = C(), h = c.h, S_ = S(), res = S_.res;
  var exams = c.examList();
  var groups = { confirmed: [], ready: [], waiting: [], stuck: [] };
  exams.forEach(function (e) { groups[c.examStatus(e).kind].push(e); });

  body.appendChild(h('div', { class: 'card row' }, [
    h('h2', { text: 'Booking', style: 'margin:0' }),
    h('span', { class: 'sub', text: groups.confirmed.length + ' booked · ' + groups.ready.length + ' ready · ' +
      (groups.waiting.length + groups.stuck.length) + ' blocked' }),
    h('span', { class: 'spacer' }),
    groups.ready.length ? h('button', { class: 'btn sm primary', text: 'Suggest times for all ' + groups.ready.length + '…', onclick: suggestDialog }) : null,
    h('button', { class: 'btn sm', text: 'Export CSV', onclick: exportBookings }),
    h('button', { class: 'btn sm', text: 'Export calendar (.ics)', onclick: exportIcs }),
    h('button', { class: 'btn sm ghost', text: 'Print', onclick: function () { window.print(); } })
  ]));

  if (res.bookingWarnings.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Bookings that no longer hold (' + res.bookingWarnings.length + ')' }),
      h('p', { class: 'sub', text: 'These times were booked when they worked. Something changed underneath them — a committee edit, or someone narrowing their availability. They are still booked; nothing was silently moved.' }),
      h('ul', { class: 'clean' }, res.bookingWarnings.map(function (w) {
        var e = Object.assign({ id: w.id }, S_.data.exams[w.id]);
        var bk = res.confirmed[w.id];
        return h('li', {}, [
          h('div', { class: 'row' }, [
            h('b', { text: c.examName(e) }),
            h('span', { class: 'sub', text: c.fmtDay(bk.dayKey) + ' ' + c.fmtTime(bk.startMin) }),
            h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm', text: 'Rebook…', onclick: function () { bookDialog(e); } }),
            h('button', { class: 'btn sm danger', text: 'Release', onclick: function () { db().put(root() + '/confirmed/' + w.id, null); } })
          ]),
          h('div', { class: 'sub', text: c.bookingWarningText(w) })
        ]);
      }))
    ]));
  }

  if (res.bookingConflicts.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Bookings that no longer fit' }),
      h('p', { class: 'sub', text: 'The window or the roster changed underneath these.' }),
      h('ul', { class: 'clean' }, res.bookingConflicts.map(function (bc) {
        var e = S_.data.exams[bc.id] || {};
        return h('li', { class: 'row' }, [
          h('b', { text: c.examName(Object.assign({ id: bc.id }, e)) }),
          h('span', { class: 'sub', text: bc.why }), h('span', { class: 'spacer' }),
          h('button', { class: 'btn sm danger', text: 'Release', onclick: function () { db().put(root() + '/confirmed/' + bc.id, null); } })
        ]);
      }))
    ]));
  }

  /* ---- ready to book: the working queue ---- */
  if (groups.ready.length) {
    var rows = groups.ready.slice().sort(function (a, b) {
      return (res.options[a.id] || []).length - (res.options[b.id] || []).length;
    }).map(function (e) {
      var opts = res.options[e.id] || [];
      var tight = opts.length <= 3;
      return h('tr', {}, [
        h('td', {}, [h('b', { text: c.examName(e) }),
          e.prefer ? h('span', { class: 'pill mute', style: 'margin-left:.4rem', text: 'wants ' + e.prefer }) : null]),
        h('td', { class: 'sub', text: (e.members || []).map(c.facName).join(', ') }),
        h('td', { class: 'num' }, [h('span', { class: 'pill ' + (tight ? 'warn' : 'mute'), text: String(opts.length) })]),
        h('td', { class: 'sub', text: c.considerationText(e) || '' }),
        h('td', { style: 'white-space:nowrap;width:1%' }, [
          h('button', { class: 'btn sm primary', text: 'Book…', onclick: function () { bookDialog(e); } })
        ])
      ]);
    });
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Ready to book (' + groups.ready.length + ')' }),
      h('p', { class: 'sub', text: 'Fewest options first — book those before their times get taken.' }),
      h('div', { class: 'tablescroll' }, [h('table', { class: 'data' }, [
        h('thead', {}, [h('tr', {}, ['Student', 'Committee', 'Times', 'Considerations', ''].map(function (t) { return h('th', { text: t }); }))]),
        h('tbody', {}, rows)
      ])])
    ]));
  }

  /* ---- blocked ---- */
  var blocked = groups.waiting.concat(groups.stuck);
  if (blocked.length) {
    body.appendChild(h('div', { class: 'card' }, [
      h('h2', { text: 'Blocked (' + blocked.length + ')' }),
      h('ul', { class: 'clean' }, blocked.map(function (e) {
        return h('li', { class: 'row' }, [
          h('b', { text: c.examName(e) }),
          h('span', { class: 'sub', text: (e.members || []).map(c.facName).join(', ') }),
          h('span', { class: 'spacer' }), c.statusPill(e)
        ]);
      }))
    ]));
  }

  /* ---- booked ---- */
  if (groups.confirmed.length) {
    var byDay = {};
    groups.confirmed.forEach(function (e) {
      var sl = res.confirmed[e.id];
      (byDay[sl.dayKey] = byDay[sl.dayKey] || []).push({ e: e, s: sl });
    });
    var card = h('div', { class: 'card' }, [
      h('div', { class: 'row' }, [
        h('h2', { text: 'Booked (' + groups.confirmed.length + ')', style: 'margin:0' }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm danger', text: 'Release all', onclick: function () {
          if (!confirm('Release all ' + groups.confirmed.length + ' bookings? Times go back to being suggestions.')) return;
          db().put(root() + '/confirmed', null).then(function () { c.toast('Released'); });
        } })
      ])
    ]);
    Object.keys(byDay).sort().forEach(function (k) {
      var list = byDay[k].sort(function (a, b) { return a.s.startMin - b.s.startMin; });
      card.appendChild(h('h3', { style: 'margin:1rem 0 .2rem;color:var(--muted)', text: c.fmtDayLong(k) }));
      card.appendChild(h('table', { class: 'data', style: 'width:100%' }, [
        h('tbody', {}, list.map(function (x) {
          return h('tr', {}, [
            h('td', { style: 'white-space:nowrap;width:1%' }, [h('b', { text: c.fmtTime(x.s.startMin) + ' – ' + c.fmtTime(x.s.endMin) })]),
            h('td', {}, [h('b', { text: c.examName(x.e) })]),
            h('td', { class: 'sub', text: (x.e.members || []).map(c.facName).join(', ') }),
            h('td', { style: 'white-space:nowrap;width:1%' }, [
              h('button', { class: 'btn sm ghost', text: 'Change…', onclick: function () { bookDialog(x.e); } }),
              h('button', { class: 'btn sm ghost', text: 'Release', onclick: function () { db().put(root() + '/confirmed/' + x.e.id, null); } })
            ])
          ]);
        }))
      ]));
    });
    body.appendChild(card);
  }

  if (!exams.length) body.appendChild(h('div', { class: 'card empty', text: 'No exams yet.' }));
}

/* Book one exam. Shows every workable time, flags the ones that would strand
   another student, and honours an early/late preference in the ordering. */
function bookDialog(e) {
  var c = C(), h = c.h, res = S().res;
  var current = res.confirmed[e.id];
  var opts = res.options[e.id] || [];
  if (current) opts = (res.cands[e.id] || []).slice();     // rebooking: offer all workable times

  var ordered = c.orderedOptions(e, opts);
  var impact = {};
  ordered.forEach(function (sid) { impact[sid] = Solver.bookingImpact(res, c.examList(), e.id, sid); });

  var body = h('div', {}, [
    h('p', { class: 'sub', text: (e.members || []).map(c.facName).join(', ') }),
    c.considerationText(e) ? h('div', { class: 'hint', text: c.considerationText(e) }) : null,
    current ? h('p', { class: 'sub' }, [document.createTextNode('Currently booked for '),
      h('b', { text: c.fmtDay(current.dayKey) + ' ' + c.fmtTime(current.startMin) })]) : null,
    h('p', { class: 'sub', text: ordered.length
      ? ordered.length + ' time' + (ordered.length === 1 ? '' : 's') + ' work for all three members' +
        (e.prefer ? ', ' + (e.prefer === 'late' ? 'latest' : 'earliest') + ' first as requested' : '') + '.'
      : 'No time currently works. Someone needs to open more availability, or another booking has to move.' }),
    ordered.length ? h('div', { class: 'tablescroll', style: 'max-height:46vh' }, [h('table', { class: 'data' }, [
      h('tbody', {}, ordered.map(function (sid) {
        var sl = res.slots[sid], hits = impact[sid] || [];
        return h('tr', {}, [
          h('td', { style: 'white-space:nowrap' , text: c.fmtDay(sl.dayKey) }),
          h('td', { style: 'white-space:nowrap' }, [h('b', { text: c.fmtTime(sl.startMin) + ' – ' + c.fmtTime(sl.endMin) })]),
          h('td', {}, [hits.length
            ? h('span', { class: 'pill bad', title: hits.map(function (id) { return c.examName(Object.assign({ id: id }, S().data.exams[id])); }).join(', '),
                text: 'would strand ' + hits.length + ' other' + (hits.length === 1 ? '' : 's') })
            : h('span', { class: 'pill ok', text: 'safe' })]),
          h('td', { style: 'width:1%' }, [h('button', { class: 'btn sm', text: 'Book', onclick: function () {
            if (hits.length && !confirm('Booking this leaves no workable time for:\n\n' +
                hits.map(function (id) { return '  · ' + c.examName(Object.assign({ id: id }, S().data.exams[id])); }).join('\n') +
                '\n\nBook it anyway?')) return;
            db().put(root() + '/confirmed/' + e.id, { dayKey: sl.dayKey, startMin: sl.startMin, at: Date.now() })
              .then(function () { c.toast('Booked ' + c.examName(e) + ' — ' + c.fmtDay(sl.dayKey) + ' ' + c.fmtTime(sl.startMin)); c.closeModal(); });
          } })])
        ]);
      }))
    ])]) : null
  ]);

  c.modal('Book ' + c.examName(e), body, current
    ? [{ text: 'Release this booking', danger: true, fn: function () { db().put(root() + '/confirmed/' + e.id, null); } }]
    : []);
}

/* Propose a time for everything still open, so the organiser can see a way to
   finish rather than booking greedily into a corner. */
function suggestDialog() {
  var c = C(), h = c.h, res = S().res;
  var ids = Object.keys(res.suggestion);
  var stuck = res.bookable.filter(function (id) { return !res.suggestion[id]; });

  var body = h('div', {}, [
    h('p', { class: 'sub', text: ids.length
      ? 'A complete set of times that works for everyone at once. Booking all of them is safe — they do not clash. You can also take them one at a time.'
      : 'Nothing to propose.' }),
    stuck.length ? h('div', { class: 'hint', text: stuck.length + ' exam' + (stuck.length === 1 ? '' : 's') +
      ' could be booked individually but cannot fit alongside the rest. Book those by hand.' }) : null,
    ids.length ? h('div', { class: 'tablescroll', style: 'max-height:50vh' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, ['Student', 'Proposed', ''].map(function (t) { return h('th', { text: t }); }))]),
      h('tbody', {}, ids.map(function (id) {
        var e = Object.assign({ id: id }, S().data.exams[id]), sl = res.suggestion[id];
        return h('tr', {}, [
          h('td', {}, [h('b', { text: c.examName(e) }),
            e.prefer ? h('span', { class: 'pill mute', style: 'margin-left:.4rem', text: 'wants ' + e.prefer }) : null]),
          h('td', { style: 'white-space:nowrap', text: c.fmtDay(sl.dayKey) + ' ' + c.fmtTime(sl.startMin) }),
          h('td', { style: 'width:1%' }, [h('button', { class: 'btn sm', text: 'Book', onclick: function (ev) {
            db().put(root() + '/confirmed/' + id, { dayKey: sl.dayKey, startMin: sl.startMin, at: Date.now() })
              .then(function () { ev.target.textContent = 'Booked'; ev.target.disabled = true; });
          } })])
        ]);
      }))
    ])]) : null
  ]);

  c.modal('Suggested times', body, ids.length ? [
    { text: 'Book all ' + ids.length, primary: true, fn: function () {
      var payload = {};
      ids.forEach(function (id) {
        payload[id] = { dayKey: res.suggestion[id].dayKey, startMin: res.suggestion[id].startMin, at: Date.now() };
      });
      db().patch(root() + '/confirmed', payload).then(function () { c.toast('Booked ' + ids.length + ' exams'); });
    } }
  ] : []);
}

/* ================================================================= tab: exams */

function tabExams(body) {
  var c = C(), h = c.h, S_ = S(), res = S_.res;
  var exams = c.examList();
  body.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('h2', { text: 'Exams (' + exams.length + ')', style: 'margin:0' }), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', text: 'Re-import roster…', onclick: importDialog })
    ]),
    h('div', { class: 'tablescroll' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, ['Student', 'Committee', 'Special considerations', 'Status', ''].map(function (t) { return h('th', { text: t }); }))]),
      h('tbody', {}, exams.map(function (e) {
        var status = c.statusPill(e);
        var bl = e.blackouts || [];
        return h('tr', {}, [
          h('td', {}, [h('b', { text: c.examName(e) })]),
          h('td', { class: 'sub', text: (e.members || []).map(c.facName).join(', ') }),
          h('td', { class: 'sub' }, [
            bl.length ? h('div', { text: bl.map(describeBlackout).join('; ') }) : null,
            e.note ? h('div', { style: 'font-style:italic;margin-top:.15rem', text: e.note }) : null,
            (!bl.length && !e.note) ? h('span', { text: '—' }) : null
          ]),
          h('td', {}, [status]),
          h('td', { style: 'white-space:nowrap' }, [
            h('button', { class: 'btn sm ghost', text: 'Considerations…', onclick: function () { blackoutDialog(e); } }),
            h('button', { class: 'btn sm ghost', text: 'Book…', onclick: function () { bookDialog(e); } })
          ])
        ]);
      }))
    ])])
  ]));
}

function describeBlackout(b) {
  var c = C();
  var when = b.dow != null
    ? 'every ' + c.DOWFULL[b.dow]
    : (b.from === b.to ? c.fmtDay(b.from) : c.fmtDay(b.from) + '–' + c.fmtDay(b.to));
  var t = (b.fromMin != null || b.toMin != null)
    ? ' ' + c.fmtTime(b.fromMin != null ? b.fromMin : 0) + '–' + c.fmtTime(b.toMin != null ? b.toMin : 1440)
    : '';
  return (b.label ? b.label + ': ' : '') + when + t;
}

function blackoutDialog(e) {
  var c = C(), h = c.h, st = c.settings();
  var list = (e.blackouts || []).slice();
  var note = e.note || '';
  var listHost = h('div');

  function draw() {
    listHost.textContent = '';
    if (!list.length) {
      listHost.appendChild(h('p', { class: 'sub', text: 'No constraints — any time all three members are free may be used.' }));
      return;
    }
    list.forEach(function (b, i) {
      listHost.appendChild(h('div', { class: 'row', style: 'padding:.35rem 0;border-bottom:1px solid var(--line)' }, [
        h('span', { text: describeBlackout(b) }), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm danger', text: 'Remove', onclick: function () { list.splice(i, 1); draw(); } })
      ]));
    });
  }
  draw();

  function syncKind() {
    var wk = c.$('#bo-kind').value === 'weekday';
    c.$('#bo-dates').style.display = wk ? 'none' : '';
    c.$('#bo-weekday').style.display = wk ? '' : 'none';
  }
  function syncTimes() {
    var all = c.$('#bo-allday').checked;
    c.$('#bo-t1').disabled = all; c.$('#bo-t2').disabled = all;
  }

  var body = h('div', {}, [
    h('p', { class: 'sub', text: 'Times this student cannot sit the exam — travel, a class they teach or take, a religious observance, anything else. The scheduler treats these as hard blocks and will not place the exam there.' }),
    h('h3', { text: 'Current constraints' }),
    listHost,

    h('h3', { style: 'margin-top:1.2rem', text: 'Add one' }),
    h('label', { class: 'field' }, [h('span', { text: 'Applies to' }),
      h('select', { id: 'bo-kind', onchange: syncKind }, [
        h('option', { value: 'dates', text: 'Specific dates' }),
        h('option', { value: 'weekday', text: 'A day of the week, every week' })
      ])]),

    h('div', { id: 'bo-dates', class: 'row' }, [
      h('label', { class: 'field' }, [h('span', { text: 'From date' }),
        h('input', { type: 'date', id: 'bo-a', value: st.startDate, min: st.startDate, max: st.endDate })]),
      h('label', { class: 'field' }, [h('span', { text: 'To date' }),
        h('input', { type: 'date', id: 'bo-b', value: st.startDate, min: st.startDate, max: st.endDate })])
    ]),
    h('div', { id: 'bo-weekday', style: 'display:none' }, [
      h('label', { class: 'field' }, [h('span', { text: 'Every' }),
        h('select', { id: 'bo-dow' }, [1, 2, 3, 4, 5].map(function (d) {
          return h('option', { value: String(d), text: c.DOWFULL[d] });
        }))])
    ]),

    h('label', { class: 'field' }, [h('span', { text: 'Time of day' }),
      h('div', { class: 'row' }, [
        h('label', { class: 'sub' }, [
          h('input', { type: 'checkbox', id: 'bo-allday', checked: true, onchange: syncTimes }),
          document.createTextNode(' all day')
        ]),
        c.timeSelect('bo-t1', st, st.dayStartMin), c.timeSelect('bo-t2', st, st.dayEndMin)
      ])]),
    h('label', { class: 'field' }, [h('span', { text: 'Reason (optional — shown on the board)' }),
      h('input', { type: 'text', id: 'bo-label', placeholder: 'e.g. conference travel', style: 'width:100%' })]),
    h('div', { class: 'row' }, [h('button', { class: 'btn', text: '+ Add this constraint', onclick: addOne })]),

    h('h3', { style: 'margin-top:1.4rem', text: 'Preference' }),
    h('p', { class: 'sub', text: 'A soft steer, not a rule. It orders the times offered when booking and nudges the suggested set, but never rules a time out.' }),
    h('select', { id: 'bo-prefer' }, [
      h('option', { value: '', text: 'No preference', selected: !e.prefer }),
      h('option', { value: 'early', text: 'As early in the period as possible', selected: e.prefer === 'early' }),
      h('option', { value: 'late', text: 'As late in the period as possible', selected: e.prefer === 'late' })
    ]),

    h('h3', { style: 'margin-top:1.4rem', text: 'Note' }),
    h('p', { class: 'sub', text: 'Anything the committee should know that is not a hard time constraint. Shown alongside the exam; does not affect scheduling.' }),
    h('textarea', { id: 'bo-note', style: 'min-height:70px;font-family:inherit;font-size:.9rem',
      placeholder: 'e.g. joining remotely from Berlin; needs a room with a projector', text: note })
  ]);

  function addOne() {
    var rec = {}, kind = c.$('#bo-kind').value;
    if (kind === 'weekday') {
      rec.dow = +c.$('#bo-dow').value;
    } else {
      var a = c.$('#bo-a').value, b = c.$('#bo-b').value;
      if (!a || !b) { c.toast('Pick both dates'); return; }
      if (b < a) { c.toast('The end date is before the start'); return; }
      rec.from = a; rec.to = b;
    }
    if (!c.$('#bo-allday').checked) {
      var t1 = +c.$('#bo-t1').value, t2 = +c.$('#bo-t2').value;
      if (t2 <= t1) { c.toast('The end time is before the start'); return; }
      rec.fromMin = t1; rec.toMin = t2;
    }
    var lab = c.$('#bo-label').value.trim();
    if (lab) rec.label = lab;
    list.push(rec); draw();
    c.$('#bo-label').value = '';
  }

  c.modal('Special considerations — ' + c.examName(e), body, [
    { text: 'Save', primary: true, fn: function () {
      db().patch(root() + '/exams/' + e.id, {
        blackouts: list.length ? list : null,
        note: c.$('#bo-note').value.trim() || null,
        prefer: c.$('#bo-prefer').value || null
      }).then(function () { c.toast('Saved'); });
    } }
  ]);
  setTimeout(function () { syncKind(); syncTimes(); }, 0);
}

function importDialog() {
  var c = C(), h = c.h;
  var body = h('div', {}, [
    h('p', { class: 'sub', text: 'Paste the roster again to add or correct entries. Faculty who keep the same name keep the same personal link. Availability already collected is untouched.' }),
    h('textarea', { id: 'imp', style: 'min-height:240px', text: c.examList().map(function (e) {
      return [e.last, e.first].concat((e.members || []).map(c.facName)).join(', ');
    }).join('\n') })
  ]);
  c.modal('Re-import roster', body, [
    { text: 'Replace roster', primary: true, fn: function () {
      var p = parseRoster(c.$('#imp').value);
      if (p.errors.length) { c.toast(p.errors[0], 6000); return true; }
      db().patch(root(), { faculty: p.faculty, exams: p.exams }).then(function () { c.toast('Roster updated'); });
    } }
  ]);
}

/* ================================================================= tab: faculty */

function tabFaculty(body) {
  var c = C(), h = c.h, S_ = S();
  var facs = c.facList();
  body.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('h2', { text: 'Faculty (' + facs.length + ')', style: 'margin:0' }),
      h('span', { class: 'sub', text: 'everyone uses the same link; names here are what they pick from' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', text: 'Paste email addresses…', onclick: emailDialog })
    ]),
    h('div', { class: 'tablescroll' }, [h('table', { class: 'data' }, [
      h('thead', {}, [h('tr', {}, ['Name', 'Email', 'Status', 'Committees', ''].map(function (t) { return h('th', { text: t }); }))]),
      h('tbody', {}, facs.map(function (f) {
        var n = c.examList().filter(function (e) { return (e.members || []).indexOf(f.id) >= 0; }).length;
        return h('tr', {}, [
          h('td', {}, [h('input', { type: 'text', value: f.name, style: 'width:150px', onchange: function (ev) {
            db().patch(root() + '/faculty/' + f.id, { name: ev.target.value.trim() }); } })]),
          h('td', {}, [h('input', { type: 'email', value: f.email || '', style: 'width:190px', placeholder: 'name@uchicago.edu', onchange: function (ev) {
            db().patch(root() + '/faculty/' + f.id, { email: ev.target.value.trim() }); } })]),
          h('td', {}, [c.submitted(f.id) ? h('span', { class: 'pill ok', text: 'submitted' }) : h('span', { class: 'pill bad', text: 'no reply' })]),
          h('td', { class: 'num', text: String(n) }),
          h('td', { style: 'white-space:nowrap' }, [
            h('button', { class: 'btn sm ghost', text: 'Open grid', onclick: function () { c.setMe(f.id); location.hash = '#/me'; } }),
            f.email ? h('a', { class: 'btn sm', href: mailtoFor(f.id), text: 'Email' }) : null,
            h('button', { class: 'btn sm ghost', text: 'Reset', title: 'clear this person’s availability', onclick: function () {
              if (!confirm('Clear ' + f.name + '’s availability? They will need to fill it in again.')) return;
              db().put(root() + '/avail/' + f.id, null); } })
          ])
        ]);
      }))
    ])])
  ]));
}

function emailDialog() {
  var c = C(), h = c.h;
  var body = h('div', {}, [
    h('p', { class: 'sub', text: 'One per line: Name, email. Names are matched loosely against the roster.' }),
    h('textarea', { id: 'em', style: 'min-height:220px', placeholder: 'Anderson, john.anderson@uchicago.edu' })
  ]);
  c.modal('Paste email addresses', body, [
    { text: 'Apply', primary: true, fn: function () {
      var lines = c.$('#em').value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
      var facs = c.facList(), patch = {}, hits = 0, misses = [];
      lines.forEach(function (l) {
        var m = l.match(/^(.*?)[,;\t]\s*(\S+@\S+)$/);
        if (!m) { misses.push(l); return; }
        var nm = m[1].trim().toLowerCase(), em = m[2].trim();
        var f = facs.filter(function (x) { return x.name.toLowerCase() === nm; })[0]
             || facs.filter(function (x) { return x.name.toLowerCase().indexOf(nm) >= 0 || nm.indexOf(x.name.toLowerCase()) >= 0; })[0];
        if (!f) { misses.push(l); return; }
        patch[f.id + '/email'] = em; hits++;
      });
      db().patch(root() + '/faculty', patch).then(function () {
        c.toast(hits + ' matched' + (misses.length ? ', ' + misses.length + ' not recognised' : ''), 5000);
      });
    } }
  ]);
}

/* ================================================================= tab: settings */

function tabSettings(body) {
  var c = C(), h = c.h, S_ = S(), st = c.settings();
  var ex = (st.excludeDates || []).join(', ');

  body.appendChild(h('div', { class: 'card' }, [
    h('h2', { text: 'Event' }),
    h('label', { class: 'field' }, [h('span', { text: 'Title' }), h('input', { type: 'text', id: 's-title', value: (S_.data.meta && S_.data.meta.title) || '', style: 'width:100%;max-width:420px', onchange: function (ev) { db().patch(root() + '/meta', { title: ev.target.value }); } })]),
    h('label', { class: 'field' }, [h('span', { text: 'Change organiser passphrase' }),
      h('div', { class: 'row' }, [h('input', { type: 'password', id: 's-pin', placeholder: 'new passphrase', style: 'width:220px' }),
        h('button', { class: 'btn sm', text: 'Change', onclick: function () {
          var v = c.$('#s-pin').value; if (v.length < 4) { c.toast('Too short'); return; }
          db().patch(root() + '/meta', { adminHash: c.sha(v) }).then(function () { localStorage.setItem('cs.pin', v); c.toast('Changed'); });
        } })])]),
    h('h3', { style: 'margin-top:1.2rem', text: 'Reset' }),
    h('div', { class: 'row' }, [
      h('button', { class: 'btn sm danger', text: 'Clear all availability', onclick: function () {
        if (!confirm('Delete every faculty member’s availability? The roster and links are kept.')) return;
        db().put(root() + '/avail', null).then(function () { c.toast('Cleared'); });
      } }),
      h('button', { class: 'btn sm danger', text: 'Delete the whole event', onclick: function () {
        if (!confirm('Delete everything — roster, links, availability, schedule?')) return;
        if (!confirm('Really? This cannot be undone.')) return;
        db().put(root(), null).then(function () { location.reload(); });
      } })
    ])
  ]));

  body.appendChild(h('div', { class: 'card' }, [
    h('h2', { text: 'Scheduling window' }),
    h('div', { class: 'grid2' }, [
      h('div', {}, [
        h('label', { class: 'field' }, [h('span', { text: 'First day' }), h('input', { type: 'date', id: 's-a', value: st.startDate })]),
        h('label', { class: 'field' }, [h('span', { text: 'Last day' }), h('input', { type: 'date', id: 's-b', value: st.endDate })]),
        h('label', { class: 'field' }, [h('span', { text: 'Skip these dates (comma separated, YYYY-MM-DD)' }),
          h('input', { type: 'text', id: 's-ex', value: ex, style: 'width:100%' })]),
        h('label', { class: 'sub' }, [h('input', { type: 'checkbox', id: 's-wd', checked: st.weekdaysOnly !== false }), document.createTextNode(' weekdays only')])
      ]),
      h('div', {}, [
        h('label', { class: 'field' }, [h('span', { text: 'Day starts' }), c.timeSelect('s-ds', { dayStartMin: 6 * 60, dayEndMin: 22 * 60 }, st.dayStartMin)]),
        h('label', { class: 'field' }, [h('span', { text: 'Day ends' }), c.timeSelect('s-de', { dayStartMin: 6 * 60, dayEndMin: 22 * 60 }, st.dayEndMin)]),
        h('label', { class: 'field' }, [h('span', { text: 'Exam length (minutes)' }), h('input', { type: 'number', id: 's-dur', value: st.durationMin, min: '30', step: '30', style: 'width:100px' })]),
        h('label', { class: 'field' }, [h('span', { text: 'Exams may start every' }),
          h('select', { id: 's-step' }, [30, 60, 90, 120].map(function (v) { return h('option', { value: String(v), text: v + ' min', selected: v === st.slotStepMin }); }))])
      ])
    ]),
    h('div', { class: 'row' }, [
      h('button', { class: 'btn primary', text: 'Save window', onclick: function () {
        var next = {
          startDate: c.$('#s-a').value, endDate: c.$('#s-b').value,
          dayStartMin: +c.$('#s-ds').value, dayEndMin: +c.$('#s-de').value,
          durationMin: +c.$('#s-dur').value, slotStepMin: +c.$('#s-step').value,
          weekdaysOnly: c.$('#s-wd').checked,
          excludeDates: c.$('#s-ex').value.split(/[,\s]+/).filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); })
        };
        if (next.endDate < next.startDate) { c.toast('End date is before the start'); return; }
        if (next.dayEndMin - next.dayStartMin < next.durationMin) { c.toast('The day is shorter than one exam'); return; }
        db().put(root() + '/settings', next).then(function () { c.toast('Saved — availability grids now cover the new window'); });
      } }),
      h('span', { class: 'sub', text: 'Changing the window keeps availability already entered for days that are still in range.' })
    ])
  ]));
}

/* =================================================================== export */

function csv(rows) {
  var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
  return rows.map(function (r) { return r.map(q).join(','); }).join('\r\n');
}

function download(name, mime, text) {
  var b = new Blob(['\ufeff' + text], { type: mime + ';charset=utf-8' });   // BOM so Excel reads UTF-8
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

function stamp() {
  var m = /(\d{4}-\d{2}-\d{2})/.exec(new Date().toISOString());
  return m ? m[1] : 'export';
}

/* ---- 1. the bookings ---- */
function bookingRows() {
  var c = C(), res = S().res;
  var out = c.examList().map(function (e) {
    var b = res.confirmed[e.id], st = c.examStatus(e);
    var ms = (e.members || []).map(c.facName);
    return {
      sortDay: b ? b.dayKey : '9999', sortMin: b ? b.startMin : 0,
      row: [e.last, e.first, b ? b.dayKey : '', b ? c.fmtTime(b.startMin) : '', b ? c.fmtTime(b.endMin) : '',
            ms[0] || '', ms[1] || '', ms[2] || '',
            st.kind === 'confirmed' ? 'booked' : st.kind === 'ready' ? 'ready to book (' + st.options.length + ' times)'
              : st.kind === 'waiting' ? 'waiting on ' + st.missing.map(c.facName).join('; ')
              : (st.squeezed ? 'all workable times taken' : 'no time works for all three'),
            c.considerationText(e) || '']
    };
  });
  out.sort(function (a, b) { return a.sortDay < b.sortDay ? -1 : a.sortDay > b.sortDay ? 1 : a.sortMin - b.sortMin; });
  return [['Last Name', 'First Name', 'Date', 'Start', 'End', 'Member 1', 'Member 2', 'Member 3',
           'Status', 'Special considerations']].concat(out.map(function (x) { return x.row; }));
}
function exportBookings() { download('candidacy-schedule-' + stamp() + '.csv', 'text/csv', csv(bookingRows())); C().toast('Schedule downloaded'); }

/* ---- 2. faculty response tracker ---- */
function facultyRows() {
  var c = C(), S_ = S(), res = S_.res, total = res.days.length * res.cpd;
  var rows = [['Name', 'Email', 'Submitted', 'Last updated', 'Half-hours open', 'Percent open',
               '90-min slots offered', 'Committees', 'Booked']];
  c.facList().forEach(function (f) {
    var a = S_.data.avail[f.id], open = 0;
    if (a && a.days) res.days.forEach(function (d) {
      var r = a.days[d.key] || '';
      for (var i = 0; i < r.length; i++) if (r[i] === '1') open++;
    });
    var windows = 0;
    if (a && a.days) {
      var mask = Solver.freeMaskFrom(res, a.days);
      for (var i2 = 0; i2 < mask.length; i2++) windows += mask[i2];
    }
    var mine = c.examList().filter(function (e) { return (e.members || []).indexOf(f.id) >= 0; });
    rows.push([f.name, f.email || '', c.submitted(f.id) ? 'yes' : 'no',
      a && a.updated ? new Date(a.updated).toISOString().slice(0, 10) : '',
      c.submitted(f.id) ? open : '', c.submitted(f.id) ? Math.round(open / total * 100) + '%' : '',
      c.submitted(f.id) ? windows : '',
      mine.length, mine.filter(function (e) { return res.confirmed[e.id]; }).length]);
  });
  return rows;
}
function exportFaculty() { download('candidacy-faculty-' + stamp() + '.csv', 'text/csv', csv(facultyRows())); C().toast('Faculty list downloaded'); }

/* ---- 3. availability, as readable free blocks rather than 30-min cells ---- */
function availabilityRows() {
  var c = C(), S_ = S(), res = S_.res, st = c.settings();
  var rows = [['Name', 'Date', 'Day', 'Free from', 'Free until', 'Length (min)', 'Fits an exam']];
  c.facList().forEach(function (f) {
    var a = S_.data.avail[f.id];
    if (!a || !a.days) return;
    res.days.forEach(function (d) {
      var row = a.days[d.key] || '', i = 0;
      while (i < res.cpd) {
        if (row[i] !== '1') { i++; continue; }
        var j = i;
        while (j < res.cpd && row[j] === '1') j++;
        var from = st.dayStartMin + i * Solver.CELL, to = st.dayStartMin + j * Solver.CELL;
        rows.push([f.name, d.key, c.DOWFULL[Solver.parseYmd(d.key).getDay()],
                   c.fmtTime(from), c.fmtTime(to), to - from, (to - from) >= st.durationMin ? 'yes' : 'no']);
        i = j;
      }
    });
  });
  return rows;
}
function exportAvailability() { download('candidacy-availability-' + stamp() + '.csv', 'text/csv', csv(availabilityRows())); C().toast('Availability downloaded'); }

/* ---- 4. every workable time per exam ---- */
function optionRows() {
  var c = C(), res = S().res;
  var rows = [['Last Name', 'First Name', 'Committee', 'Date', 'Day', 'Start', 'End', 'Currently booked']];
  c.examList().forEach(function (e) {
    var booked = res.confirmed[e.id];
    var list = booked ? [booked.slotId] : c.orderedOptions(e, res.options[e.id] || []);
    list.forEach(function (sid) {
      var sl = res.slots[sid];
      rows.push([e.last, e.first, (e.members || []).map(c.facName).join('; '), sl.dayKey,
                 c.DOWFULL[Solver.parseYmd(sl.dayKey).getDay()], c.fmtTime(sl.startMin), c.fmtTime(sl.endMin),
                 booked ? 'yes' : '']);
    });
  });
  return rows;
}
function exportOptions() { download('candidacy-possible-times-' + stamp() + '.csv', 'text/csv', csv(optionRows())); C().toast('Possible times downloaded'); }

/* ---- 5. roster + considerations ---- */
function rosterRows() {
  var c = C(), res = S().res;
  var rows = [['Last Name', 'First Name', 'Member 1', 'Member 2', 'Member 3', 'Preference', 'Blocked times', 'Note', 'Possible times']];
  c.examList().forEach(function (e) {
    var ms = (e.members || []).map(c.facName);
    rows.push([e.last, e.first, ms[0] || '', ms[1] || '', ms[2] || '', e.prefer || '',
      (e.blackouts || []).map(describeBlackout).join('; '), e.note || '',
      res.confirmed[e.id] ? 'booked' : (res.options[e.id] || []).length]);
  });
  return rows;
}
function exportRoster() { download('candidacy-roster-' + stamp() + '.csv', 'text/csv', csv(rosterRows())); C().toast('Roster downloaded'); }

/* ---- everything, staggered so the browser does not drop them ---- */
function exportAll() {
  var jobs = [exportBookings, exportRoster, exportFaculty, exportAvailability, exportOptions, exportIcs];
  jobs.forEach(function (fn, i) { setTimeout(fn, i * 500); });
  C().toast('Downloading ' + jobs.length + ' files — your browser may ask to allow multiple downloads', 6000);
}

function exportIcs() {
  var c = C(), res = S().res;
  var rows = c.examList().filter(function (e) { return res.confirmed[e.id]; }).map(function (e) {
    var b = res.confirmed[e.id];
    return { e: e, b: b };
  });
  function stampAt(dayKey, min) {
    var d = Solver.parseYmd(dayKey);
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
      'T' + String(Math.floor(min / 60)).padStart(2, '0') + String(min % 60).padStart(2, '0') + '00';
  }
  function tx(v) { return String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  var now = new Date();
  var dtstamp = now.getUTCFullYear() + String(now.getUTCMonth() + 1).padStart(2, '0') + String(now.getUTCDate()).padStart(2, '0') +
    'T' + String(now.getUTCHours()).padStart(2, '0') + String(now.getUTCMinutes()).padStart(2, '0') + String(now.getUTCSeconds()).padStart(2, '0') + 'Z';
  var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//candidacy-scheduler//EN', 'CALSCALE:GREGORIAN'];
  rows.forEach(function (r) {
    // no time zone, so each attendee sees the same wall-clock time
    out.push('BEGIN:VEVENT',
      'UID:cand-' + r.e.id + '-' + r.b.dayKey + '-' + r.b.startMin + '@candidacy-scheduler',
      'DTSTAMP:' + dtstamp,
      'DTSTART:' + stampAt(r.b.dayKey, r.b.startMin),
      'DTEND:' + stampAt(r.b.dayKey, r.b.endMin),
      'SUMMARY:' + tx('Candidacy exam — ' + r.e.first + ' ' + r.e.last),
      'DESCRIPTION:' + tx('Committee: ' + (r.e.members || []).map(c.facName).join(', ') +
        (c.considerationText(r.e) ? '\n' + c.considerationText(r.e) : '')),
      'END:VEVENT');
  });
  out.push('END:VCALENDAR');
  download('candidacy-exams-' + stamp() + '.ics', 'text/calendar', out.join('\r\n'));
  c.toast(rows.length + ' events downloaded');
}

/* the card shown on the dashboard */
function exportCard() {
  var c = C(), h = c.h, res = S().res;
  var booked = c.examList().filter(function (e) { return res.confirmed[e.id]; }).length;
  var items = [
    ['Schedule', 'every exam with its booked time and status', exportBookings],
    ['Roster & considerations', 'committees, preferences, blocked times, notes', exportRoster],
    ['Faculty responses', 'who replied, how much they opened, slots offered', exportFaculty],
    ['Availability', 'every free block each person gave, in plain rows', exportAvailability],
    ['Possible times', 'every workable time for every exam', exportOptions],
    ['Calendar (.ics)', booked + ' booked exam' + (booked === 1 ? '' : 's'), exportIcs]
  ];
  return h('div', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('h2', { text: 'Download data', style: 'margin:0' }),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm primary', text: 'Download everything', onclick: exportAll })
    ]),
    h('p', { class: 'sub', text: 'Everything is a snapshot of the board as it stands right now. CSVs open directly in Excel.' }),
    h('div', { class: 'grid2', style: 'margin-top:10px' }, items.map(function (it) {
      return h('div', { class: 'row', style: 'align-items:flex-start' }, [
        h('div', { style: 'flex:1' }, [h('b', { text: it[0] }), h('div', { class: 'sub', text: it[1] })]),
        h('button', { class: 'btn sm', text: 'CSV', onclick: it[2] })
      ]);
    }))
  ]);
}


})();
