/* solver.js — builds the time grid and packs exams into it.
   Pure functions: same inputs always give the same schedule, so every browser
   that has the same data draws the same board. */
(function () {
  'use strict';

  var CELL = 30; // minutes per availability cell

  /* ------------------------------------------------------------------ grid */

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseYmd(s) {
    var p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function buildDays(st) {
    var out = [], d = parseYmd(st.startDate), end = parseYmd(st.endDate);
    var skip = {};
    (st.excludeDates || []).forEach(function (k) { skip[k] = 1; });
    var guard = 0;
    while (d <= end && guard++ < 800) {
      var dow = d.getDay(), key = ymd(d);
      var weekend = (dow === 0 || dow === 6);
      if (!(st.weekdaysOnly && weekend) && !skip[key]) {
        out.push({ key: key, date: new Date(d), dow: dow });
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function cellsPerDay(st) { return Math.max(0, Math.round((st.dayEndMin - st.dayStartMin) / CELL)); }

  /* Candidate exam start times, expanded over every day in the window. */
  function buildSlots(st, days) {
    var cpd = cellsPerDay(st), span = Math.round(st.durationMin / CELL), slots = [];
    for (var di = 0; di < days.length; di++) {
      for (var m = st.dayStartMin; m + st.durationMin <= st.dayEndMin; m += st.slotStepMin) {
        var c0 = Math.round((m - st.dayStartMin) / CELL), cells = [];
        for (var k = 0; k < span; k++) cells.push(di * cpd + c0 + k);
        slots.push({ id: slots.length, di: di, dayKey: days[di].key, startMin: m, endMin: m + st.durationMin, cells: cells });
      }
    }
    return slots;
  }

  /* slot -> every slot it overlaps (same day, closer than one exam length) */
  function buildConflicts(slots, durationMin) {
    var byDay = {};
    slots.forEach(function (s) { (byDay[s.di] = byDay[s.di] || []).push(s); });
    var conf = slots.map(function () { return []; });
    Object.keys(byDay).forEach(function (di) {
      var list = byDay[di];
      for (var i = 0; i < list.length; i++) {
        for (var j = 0; j < list.length; j++) {
          if (Math.abs(list[i].startMin - list[j].startMin) < durationMin) conf[list[i].id].push(list[j].id);
        }
      }
    });
    return conf;
  }

  /* ------------------------------------------------------- availability I/O */

  /* avail in Firebase is { fid: { '2026-10-01': '0011110000111100' } } */
  function decodeAvail(raw, fids, days, cpd) {
    var map = {};
    fids.forEach(function (fid) {
      var arr = new Uint8Array(days.length * cpd);
      var rec = (raw && raw[fid]) || null;
      if (rec) {
        for (var di = 0; di < days.length; di++) {
          var s = rec[days[di].key];
          if (!s) continue;
          for (var c = 0; c < cpd && c < s.length; c++) if (s.charCodeAt(c) === 49) arr[di * cpd + c] = 1;
        }
      }
      map[fid] = arr;
    });
    return map;
  }

  function countOffered(arr) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) n += arr[i];
    return n;
  }

  /* --------------------------------------------------------------- solving */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /* input: {settings, exams, avail(raw), locks, prev, timeBudgetMs} */
  function solve(input) {
    var st = input.settings;
    var days = buildDays(st);
    var cpd = cellsPerDay(st);
    var slots = buildSlots(st, days);
    var nS = slots.length;
    var conf = buildConflicts(slots, st.durationMin);
    var exams = input.exams || [];
    var nE = exams.length;

    var fidSet = {};
    exams.forEach(function (e) { e.members.forEach(function (m) { fidSet[m] = 1; }); });
    var fidList = Object.keys(fidSet);
    var avail = decodeAvail(input.avail, fidList, days, cpd);

    var slotByKey = {};
    slots.forEach(function (s) { slotByKey[s.dayKey + 'T' + s.startMin] = s.id; });

    /* free[fid][slotId] — every 30-min cell the exam would occupy is marked open */
    var free = {};
    fidList.forEach(function (fid) {
      var a = avail[fid], f = new Uint8Array(nS);
      for (var i = 0; i < nS; i++) {
        var cs = slots[i].cells, ok = 1;
        for (var k = 0; k < cs.length; k++) if (!a[cs[k]]) { ok = 0; break; }
        f[i] = ok;
      }
      free[fid] = f;
    });

    function blockedSlot(e, s) {
      var b = e.blackouts || [];
      for (var i = 0; i < b.length; i++) {
        var x = b[i];
        if (x.from && s.dayKey < x.from) continue;
        if (x.to && s.dayKey > x.to) continue;
        if (!x.from && !x.to) continue;
        if (x.fromMin != null && s.endMin <= x.fromMin) continue;
        if (x.toMin != null && s.startMin >= x.toMin) continue;
        return true;
      }
      return false;
    }

    /* ---- candidate slots per exam (availability + student blackouts only) ---- */
    var candMask = [], cands = [];
    for (var ei = 0; ei < nE; ei++) {
      var mask = new Uint8Array(nS), list = [], e = exams[ei];
      for (var i = 0; i < nS; i++) {
        if (blockedSlot(e, slots[i])) continue;
        var ok = true;
        for (var k = 0; k < e.members.length; k++) {
          var f = free[e.members[k]];
          if (!f || !f[i]) { ok = false; break; }
        }
        if (ok) { mask[i] = 1; list.push(i); }
      }
      candMask.push(mask); cands.push(list);
    }

    /* ---- who is standing in the way of each impossible exam ---- */
    var diag = exams.map(function (e, ix) {
      var blame = {};
      e.members.forEach(function (m) { blame[m] = 0; });
      if (!cands[ix].length) {
        for (var i = 0; i < nS; i++) {
          if (blockedSlot(e, slots[i])) continue;
          for (var k = 0; k < e.members.length; k++) {
            var me = e.members[k], othersOk = true;
            for (var j = 0; j < e.members.length; j++) {
              if (j === k) continue;
              var ff = free[e.members[j]];
              if (!ff || !ff[i]) { othersOk = false; break; }
            }
            if (othersOk && (!free[me] || !free[me][i])) blame[me]++;
          }
        }
      }
      return { common: cands[ix].length, blame: blame };
    });

    /* ---- incremental state ---- */
    var busy = {};                                  // fid -> per-slot occupancy count
    fidList.forEach(function (fid) { busy[fid] = new Int16Array(nS); });
    var bc = [];                                    // exam -> per-slot count of blocked members
    for (var q = 0; q < nE; q++) bc.push(new Uint8Array(nS));
    var optCount = new Int32Array(nE);
    for (var q2 = 0; q2 < nE; q2++) optCount[q2] = cands[q2].length;

    var examsOf = {};                               // fid -> exam indices
    fidList.forEach(function (fid) { examsOf[fid] = []; });
    exams.forEach(function (e, ix) { e.members.forEach(function (m) { examsOf[m].push(ix); }); });

    var nDays = days.length;
    var dayCount = new Int32Array(nDays);
    var facDay = {};
    fidList.forEach(function (fid) { facDay[fid] = new Int32Array(nDays); });

    var assign = new Int32Array(nE); assign.fill(-1);
    var lockedIdx = new Uint8Array(nE);
    var skipped = new Uint8Array(nE);

    function markBlocked(m, t, delta) {
      var list = examsOf[m];
      for (var i = 0; i < list.length; i++) {
        var ej = list[i];
        if (!candMask[ej][t]) continue;
        if (delta > 0) { if (bc[ej][t]++ === 0) optCount[ej]--; }
        else { if (--bc[ej][t] === 0) optCount[ej]++; }
      }
    }
    function place(ix, sid) {
      assign[ix] = sid;
      var ms = exams[ix].members, cs = conf[sid], di = slots[sid].di;
      dayCount[di]++;
      for (var a = 0; a < ms.length; a++) {
        var b = busy[ms[a]];
        facDay[ms[a]][di]++;
        for (var c = 0; c < cs.length; c++) if (b[cs[c]]++ === 0) markBlocked(ms[a], cs[c], +1);
      }
    }
    function unplace(ix) {
      var sid = assign[ix]; if (sid < 0) return;
      var ms = exams[ix].members, cs = conf[sid], di = slots[sid].di;
      dayCount[di]--;
      for (var a = 0; a < ms.length; a++) {
        var b = busy[ms[a]];
        facDay[ms[a]][di]--;
        for (var c = 0; c < cs.length; c++) if (--b[cs[c]] === 0) markBlocked(ms[a], cs[c], -1);
      }
      assign[ix] = -1;
    }
    function fits(ix, sid) {
      if (!candMask[ix][sid]) return false;
      var ms = exams[ix].members;
      for (var a = 0; a < ms.length; a++) if (busy[ms[a]][sid]) return false;
      return true;
    }

    /* ---- pinned exams are hard constraints ---- */
    var lockConflicts = [];
    exams.forEach(function (e, ix) {
      var lk = (input.locks || {})[e.id];
      if (!lk) return;
      var sid = slotByKey[lk.dayKey + 'T' + lk.startMin];
      if (sid == null) { lockConflicts.push({ id: e.id, why: 'falls outside the current date/time window' }); return; }
      var ms = e.members, clash = false;
      for (var a = 0; a < ms.length; a++) if (busy[ms[a]][sid]) clash = true;
      if (clash) { lockConflicts.push({ id: e.id, why: 'double-books a member with another pinned exam' }); return; }
      lockedIdx[ix] = 1;
      place(ix, sid);
    });

    var openList = [];
    for (var oi = 0; oi < nE; oi++) if (!lockedIdx[oi]) openList.push(oi);

    var prevSid = {};
    Object.keys(input.prev || {}).forEach(function (id) {
      var p = input.prev[id];
      if (!p) return;
      var sid = slotByKey[p.dayKey + 'T' + p.startMin];
      if (sid != null) prevSid[id] = sid;
    });

    var deadline = Date.now() + (input.timeBudgetMs || 900);
    var best = null;
    var scratch = [];

    function attempt(rnd, jitter) {
      var bestMiss = best ? best.miss : openList.length + 1;
      var localAssign = null;
      var checks = 0;

      function score(ix, sid) {
        var s = prevSid[exams[ix].id] === sid ? -1000 : 0;
        var di = slots[sid].di;
        s += dayCount[di] * 3;
        var ms = exams[ix].members;
        for (var a = 0; a < ms.length; a++) {
          var n = facDay[ms[a]][di];
          s += n >= 2 ? 60 * n : -2;              // a couple per day is fine; four is not
        }
        return s + jitter * rnd() * 25;
      }

      function dfs(miss) {
        if ((++checks & 63) === 0 && Date.now() > deadline) return true;
        if (miss >= bestMiss) return false;
        var pick = -1, pickN = 1e9;
        for (var i = 0; i < openList.length; i++) {
          var ix = openList[i];
          if (assign[ix] >= 0 || skipped[ix]) continue;
          var n = optCount[ix];
          if (n < pickN) { pick = ix; pickN = n; if (!n) break; }
        }
        if (pick < 0) {
          if (miss < bestMiss) { bestMiss = miss; localAssign = Array.prototype.slice.call(assign); }
          return false;
        }
        if (pickN > 0) {
          var list = cands[pick], opts = scratch; opts.length = 0;
          for (var c = 0; c < list.length; c++) if (fits(pick, list[c])) opts.push(list[c]);
          var scored = opts.map(function (sid) { return [score(pick, sid), sid]; });
          scored.sort(function (a, b) { return a[0] - b[0]; });
          for (var k = 0; k < scored.length; k++) {
            place(pick, scored[k][1]);
            var out = dfs(miss);
            unplace(pick);
            if (out) return true;
            if (Date.now() > deadline) return true;
          }
        }
        skipped[pick] = 1;
        var o2 = dfs(miss + 1);
        skipped[pick] = 0;
        return o2;
      }

      dfs(0);
      if (localAssign && (!best || bestMiss < best.miss)) best = { assign: localAssign, miss: bestMiss };
    }

    var seed = hashStr(JSON.stringify([st.startDate, st.endDate, st.dayStartMin, st.dayEndMin,
      st.slotStepMin, st.durationMin, exams.map(function (e) { return e.id + '|' + e.members.join(','); }).join(';')]));

    attempt(mulberry32(seed), 0);
    var round = 0;
    while (best && best.miss > 0 && Date.now() < deadline && round < 60) {
      for (var r = 0; r < openList.length; r++) unplace(openList[r]);
      attempt(mulberry32(seed + (++round) * 7919), 1);
    }
    for (var r2 = 0; r2 < openList.length; r2++) unplace(openList[r2]);

    var finalAssign = best ? best.assign : Array.prototype.slice.call(assign);

    var res = {
      slotOf: {}, unscheduled: [], days: days, slots: slots, cpd: cpd, settings: st,
      lockConflicts: lockConflicts, diag: {}, free: free, avail: avail, cands: {},
      slotByKey: slotByKey, rounds: round
    };
    exams.forEach(function (e, ix) {
      res.diag[e.id] = diag[ix];
      res.cands[e.id] = cands[ix];
      var sid = finalAssign[ix];
      if (sid != null && sid >= 0) {
        var s = slots[sid];
        res.slotOf[e.id] = { dayKey: s.dayKey, startMin: s.startMin, endMin: s.endMin, slotId: sid, locked: !!lockedIdx[ix] };
      } else {
        res.unscheduled.push(e.id);
      }
    });
    return res;
  }

  /* Cells this person currently has blocked that would, on their own, open up a
     stuck exam. `myFree` lets the caller pass the grid as edited on screen so the
     hint tracks what the user is looking at rather than what they last saved. */
  function helperCells(res, exam, fid, myFree) {
    var out = {};
    var others = exam.members.filter(function (m) { return m !== fid; });
    var mine = myFree || res.free[fid];
    var slots = res.slots;
    for (var i = 0; i < slots.length; i++) {
      if (mine && mine[i]) continue;            // this slot already works for them
      var ok = true;
      for (var k = 0; k < others.length; k++) {
        var f = res.free[others[k]];
        if (!f || !f[i]) { ok = false; break; }
      }
      if (!ok) continue;
      for (var c = 0; c < slots[i].cells.length; c++) out[slots[i].cells[c]] = 1;
    }
    return out;
  }

  /* Build a per-slot free mask from a { dayKey: '0101…' } grid. */
  function freeMaskFrom(res, dayMap) {
    var cpd = res.cpd, days = res.days, cells = new Uint8Array(days.length * cpd);
    for (var di = 0; di < days.length; di++) {
      var row = dayMap[days[di].key] || '';
      for (var c = 0; c < cpd; c++) if (row.charCodeAt(c) === 49) cells[di * cpd + c] = 1;
    }
    var mask = new Uint8Array(res.slots.length);
    for (var i = 0; i < res.slots.length; i++) {
      var cs = res.slots[i].cells, ok = 1;
      for (var k = 0; k < cs.length; k++) if (!cells[cs[k]]) { ok = 0; break; }
      mask[i] = ok;
    }
    return mask;
  }

  window.Solver = {
    CELL: CELL, ymd: ymd, parseYmd: parseYmd,
    buildDays: buildDays, buildSlots: buildSlots, cellsPerDay: cellsPerDay,
    decodeAvail: decodeAvail, countOffered: countOffered,
    solve: solve, helperCells: helperCells, freeMaskFrom: freeMaskFrom, hashStr: hashStr
  };
})();
